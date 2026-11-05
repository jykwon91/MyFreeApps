"""The shared auth routes wired the way an app wires them, on a real Postgres.

SQLite ignores row locks, and a shared test connection can't show a route holding a
connection or a row surviving a refusal. The default pool here has one connection, so a
route that waits for a second connection while holding the first fails with a timeout.
"""
import hashlib
import os
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pyotp
import pytest
from fastapi import Depends, FastAPI
from fastapi_users.authentication import JWTStrategy
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy import Boolean, DateTime, ForeignKey, SmallInteger, String, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.api.account_deletion_router import build_account_deletion_router
from platform_shared.api.mobile_auth_router import build_mobile_auth_router
from platform_shared.api.totp_router import build_totp_router
from platform_shared.auth.refresh_session import RefreshSessionMixin
from platform_shared.auth.session_invalidation import SessionInvalidationMixin
from platform_shared.auth.totp_replay_guard import TotpReplayGuardMixin
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.db.models.auth_event import AuthEvent
from platform_shared.services.refresh_session_service import RefreshSessionService
from platform_shared.services.totp_account_service import TotpAccountService
from platform_shared.services.totp_service import TOTP_DIGITS, TOTP_PERIOD_SECONDS
from platform_shared.testing.factories import _FastPasswordHelper

POSTGRES_URL_ENV = "SHARED_BACKEND_TEST_POSTGRES_URL"
SECRET = "test-secret-key-that-is-long-enough-to-sign-with"
PASSWORD = "the-right-password"
EMAIL_DOMAIN = "example.com"


class _Base(DeclarativeBase):
    pass


class StackUser(SessionInvalidationMixin, TotpReplayGuardMixin, SQLAlchemyBaseUserTableUUID, _Base):
    __tablename__ = "users"

    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_recovery_codes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    totp_algorithm: Mapped[str] = mapped_column(String(10), default="sha1")
    failed_login_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failed_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StackRefreshSession(RefreshSessionMixin, _Base):
    __tablename__ = "refresh_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))


class _Manager(PlatformBaseUserManager):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET
    hibp_enabled = False

    def __init__(self, user_db: Any) -> None:
        super().__init__(user_db, _FastPasswordHelper())


class RealAuthStack:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.sessions = async_sessionmaker(engine, expire_on_commit=False)
        self.signed_in: uuid.UUID | None = None
        # A test sets this to make the step after the password and code checks refuse.
        self.prepare_deletion: Callable[[AsyncSession, Any], Awaitable[Any]] | None = None
        self.totp = TotpAccountService(
            user_model=StackUser, issuer="Test", unit_of_work_factory=self.unit_of_work,
        )
        self.refresh_sessions = RefreshSessionService(
            session_model=StackRefreshSession,
            user_model=StackUser,
            signing_key=SECRET,
            unit_of_work_factory=self.unit_of_work,
        )

        async def current_active_user(db: AsyncSession = Depends(self.get_db)) -> StackUser | None:
            return await db.get(StackUser, self.signed_in)

        async def get_user_manager(db: AsyncSession = Depends(self.get_db)) -> AsyncIterator[_Manager]:
            yield _Manager(SQLAlchemyUserDatabase(db, StackUser))

        app = FastAPI()
        app.include_router(
            build_totp_router(
                current_active_user=current_active_user,
                get_user_manager=get_user_manager,
                get_db=self.get_db,
                get_jwt_strategy=lambda: JWTStrategy(secret=SECRET, lifetime_seconds=60),
                totp_service=self.totp,
                login_dependencies=[],
            )
        )
        app.include_router(
            build_mobile_auth_router(
                secret_key=SECRET,
                session_service=self.refresh_sessions,
                current_active_user=current_active_user,
                get_user_manager=get_user_manager,
                get_db=self.get_db,
                totp_service=self.totp,
                login_dependencies=[],
            )
        )
        app.include_router(
            build_account_deletion_router(
                current_active_user=current_active_user,
                get_user_manager=get_user_manager,
                get_db_dependency=self.get_db,
                verify_totp_step_up=self.totp.verify_totp_code,
                unit_of_work_factory=self.unit_of_work,
                prepare_deletion=self._prepare_deletion,
            )
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def get_db(self) -> AsyncIterator[AsyncSession]:
        async with self.sessions() as session:
            yield session

    @asynccontextmanager
    async def unit_of_work(self) -> AsyncIterator[AsyncSession]:
        async with self.sessions() as session:
            async with session.begin():
                yield session

    async def _prepare_deletion(self, db: AsyncSession, user: Any) -> Any:
        return await self.prepare_deletion(db, user) if self.prepare_deletion else None

    async def add_user(
        self, *, is_verified: bool = True, is_active: bool = True, failed_login_count: int = 0,
    ) -> StackUser:
        user = StackUser(
            id=uuid.uuid4(),
            email=f"{uuid.uuid4().hex}@{EMAIL_DOMAIN}",
            hashed_password=_FastPasswordHelper().hash(PASSWORD),
            is_active=is_active,
            is_verified=is_verified,
            failed_login_count=failed_login_count,
        )
        async with self.unit_of_work() as db:
            db.add(user)
        return user

    async def add_user_with_2fa(self, *, failed_login_count: int = 0) -> tuple[StackUser, str, list[str]]:
        """The user, their authenticator secret, and their recovery codes."""
        user = await self.add_user()
        secret, _ = await self.totp.setup_totp(user.id)
        verified, recovery_codes = await self.totp.confirm_totp(user.id, current_code(secret))
        assert verified
        await self.make_code_usable_again(user.id)
        async with self.unit_of_work() as db:
            (await db.get(StackUser, user.id)).failed_login_count = failed_login_count
        return user, secret, recovery_codes

    async def make_code_usable_again(self, user_id: uuid.UUID) -> None:
        """A test can't wait 30 seconds for the authenticator's next code."""
        async with self.unit_of_work() as db:
            (await db.get(StackUser, user_id)).totp_last_used_step = None

    async def stored_user(self, user_id: uuid.UUID) -> StackUser | None:
        async with self.sessions() as db:
            return await db.get(StackUser, user_id)

    async def set_lockout(self, user_id: uuid.UUID, **fields: Any) -> None:
        async with self.unit_of_work() as db:
            user = await db.get(StackUser, user_id)
            for name, value in fields.items():
                setattr(user, name, value)

    async def stored_events(self, user_id: uuid.UUID | None) -> list[AuthEvent]:
        async with self.sessions() as db:
            query = select(AuthEvent).order_by(AuthEvent.created_at)
            query = query.where(AuthEvent.user_id.is_(None) if user_id is None else AuthEvent.user_id == user_id)
            return list((await db.execute(query)).scalars())

    async def stored_event_types(self, user_id: uuid.UUID | None) -> list[str]:
        return [event.event_type for event in await self.stored_events(user_id)]

    async def stored_refresh_sessions(self, user_id: uuid.UUID) -> list[StackRefreshSession]:
        async with self.sessions() as db:
            query = select(StackRefreshSession).where(StackRefreshSession.user_id == user_id)
            return list((await db.execute(query)).scalars())

    async def jwt_login(self, email: str, password: str = PASSWORD) -> StackUser | None:
        """What ``/auth/jwt/login`` calls."""
        async with self.sessions() as db:
            manager = _Manager(SQLAlchemyUserDatabase(db, StackUser))
            return await manager.authenticate(SimpleNamespace(username=email, password=password))

    async def assert_row_is_free(self, user_id: uuid.UUID) -> None:
        """Fails if a finished request left the user row locked."""
        async with self.unit_of_work() as db:
            await db.execute(
                text("SELECT id FROM users WHERE id = :id FOR UPDATE NOWAIT"), {"id": user_id},
            )


def current_code(secret: str) -> str:
    return pyotp.TOTP(
        secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS, digest=hashlib.sha256,
    ).now()


@asynccontextmanager
async def make_stack(*, pool_size: int) -> AsyncIterator[RealAuthStack]:
    url = os.environ.get(POSTGRES_URL_ENV)
    if not url:
        # CI sets this, so these tests can't quietly stop running there.
        if os.environ.get("CI"):
            pytest.fail(f"{POSTGRES_URL_ENV} isn't set")
        pytest.skip(f"{POSTGRES_URL_ENV} isn't set")
    schema = f"auth_stack_{uuid.uuid4().hex}"
    engine = create_async_engine(
        url,
        pool_size=pool_size,
        max_overflow=0,
        pool_timeout=2,
        connect_args={"server_settings": {"search_path": schema}},
    )
    async with engine.begin() as connection:
        await connection.execute(text(f"CREATE SCHEMA {schema}"))
        await connection.run_sync(_Base.metadata.create_all)
        await connection.run_sync(AuthEvent.__table__.create)

    stack = RealAuthStack(engine)
    try:
        yield stack
    finally:
        await stack.client.aclose()
        async with engine.begin() as connection:
            await connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        await engine.dispose()
