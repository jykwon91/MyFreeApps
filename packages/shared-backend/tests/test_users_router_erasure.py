"""An admin's ``DELETE /users/{id}`` erases the user's audit content, as their own deletion does.

Drives the real route, the real fastapi-users manager and the real audit
listener on SQLite, mirroring ``test_audit_erasure.py``: the deleted user's
rows and the rows about them are erased, everyone else's are kept.
"""

import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi_users import FastAPIUsers, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy import ForeignKey, String, event, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool

from platform_shared.api.users_router import build_users_router
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.core.account_deleted_by import AccountDeletedBy
from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners,
    reset_registry,
)
from platform_shared.core.audit_config import AuditConfig
from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.base import Base
from platform_shared.db.models.auth_event import AuthEvent
from platform_shared.services.account_deletion import (
    AccountDeletionBlockedError,
    delete_account_and_erase_history,
)
from platform_shared.services.prepare_deletion import AfterCommit
from platform_shared.testing.audit_erasure import (
    assert_audit_erased,
    audit_values,
    write_as,
)
from platform_shared.testing.factories import _FastPasswordHelper

_SECRET = "test-secret-key-that-is-long-enough-to-sign-with"
_GATE_PASS_HEADERS = {
    "Authorization": "Bearer admin-token", "X-Test-Gate": "pass",
    "X-Forwarded-For": "203.0.113.7", "User-Agent": "admin-console",
}


class _AppBase(DeclarativeBase):
    pass


class _User(SQLAlchemyBaseUserTableUUID, _AppBase):
    __tablename__ = "users"
    display_name: Mapped[str] = mapped_column(String(100))


class _Note(_AppBase):
    __tablename__ = "notes"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(200))


class _Manager(PlatformBaseUserManager[_User]):
    reset_password_token_secret = _SECRET
    verification_token_secret = _SECRET
    hibp_enabled = False


class _Read(schemas.BaseUser[uuid.UUID]):
    pass


class _Update(schemas.CreateUpdateDictModel):
    pass


class _Prepare:
    """An app's ``prepare_deletion``: records its call, or refuses."""

    def __init__(self, *, refuse: bool = False) -> None:
        self.refuse = refuse
        self.prepared: list[uuid.UUID] = []
        self.committed: list[uuid.UUID] = []

    async def __call__(self, _db: AsyncSession, user: Any) -> AfterCommit:
        if self.refuse:
            raise AccountDeletionBlockedError("owns a shared workspace")
        self.prepared.append(user.id)
        return lambda: self.committed.append(user.id)


@pytest_asyncio.fixture()
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    event.listen(engine.sync_engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_AppBase.metadata.create_all)
    register_audit_listeners(
        AuditConfig(sensitive_fields=frozenset({"hashed_password"}), skip_tables=frozenset(), skip_fields=frozenset()),
        base=_AppBase,
    )
    try:
        yield engine
    finally:
        reset_registry()
        await engine.dispose()


class _Strategy:
    """Every bearer token is ``caller``'s."""

    def __init__(self, caller: _User) -> None:
        self.caller = caller

    async def read_token(self, *_args: Any) -> _User:
        return self.caller


def _app(engine: AsyncEngine, caller: _User, prepare: _Prepare) -> FastAPI:
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def get_user_manager() -> AsyncIterator[_Manager]:
        async with sessions() as session:
            yield _Manager(SQLAlchemyUserDatabase(session, _User), _FastPasswordHelper())

    backend = AuthenticationBackend(
        name="test", transport=BearerTransport(tokenUrl="login"), get_strategy=lambda: _Strategy(caller),
    )
    fastapi_users = FastAPIUsers(get_user_manager, [backend])
    superuser = fastapi_users.current_user(active=True, superuser=True)

    async def strict_gate(
        user: Annotated[_User, Depends(superuser)], x_test_gate: Annotated[str | None, Header()] = None,
    ) -> _User:
        """Stands in for ``make_strict_superuser_gate``: a superuser, then a fresh step-up."""
        if x_test_gate != "pass":
            raise HTTPException(status_code=401)
        return user

    app = FastAPI()
    app.include_router(
        build_users_router(
            fastapi_users=fastapi_users,
            user_read=_Read,
            user_update=_Update,
            current_strict_superuser=strict_gate,
            prepare_deletion=prepare,
        ),
        prefix="/users",
    )
    return app


def _user(name: str, *, is_superuser: bool = False) -> _User:
    return _User(
        email=f"{name}@example.com", display_name=f"{name.title()} Person",
        hashed_password="not-a-real-hash", is_superuser=is_superuser, is_verified=True,
    )


async def _seed(db: AsyncSession) -> tuple[_User, _User, _User]:
    admin, alice, bob = _user("admin", is_superuser=True), _user("alice"), _user("bob")
    for user in (admin, alice, bob):
        await write_as(db, user, user)
    note = _Note(user_id=alice.id, body="alice private note")
    await write_as(db, alice, note)
    note.body = "admin rewrote alice note"
    await write_as(db, admin)
    await write_as(db, bob, _Note(user_id=bob.id, body="bob own note"))
    await write_as(db, alice, _Note(user_id=bob.id, body="alice note on bob account"))
    await db.commit()
    return admin, alice, bob


async def _deletion_event(db: AsyncSession, user_id: uuid.UUID) -> AuthEvent:
    return (await db.execute(
        select(AuthEvent).where(
            AuthEvent.user_id == user_id, AuthEvent.event_type == AuthEventType.ACCOUNT_DELETED,
        ),
    )).scalar_one()


async def _delete_as(app: FastAPI, caller: _User, user_id: uuid.UUID, headers: dict[str, str]) -> int:
    token = current_user_id.set(str(caller.id))
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return (await client.delete(f"/users/{user_id}", headers=headers)).status_code
    finally:
        current_user_id.reset(token)


@pytest.mark.asyncio
async def test_an_admin_delete_erases_the_users_audit_content_only(engine: AsyncEngine) -> None:
    prepare = _Prepare()
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        admin, alice, _bob = await _seed(db)
        app = _app(engine, admin, prepare)

        assert await _delete_as(app, admin, alice.id, _GATE_PASS_HEADERS) == 204

        db.expunge_all()
        assert await db.get(_User, alice.id) is None
        assert_audit_erased(
            await audit_values(db),
            erased=["alice@example.com", "Alice Person", "alice private note", "admin rewrote alice note"],
            kept=["admin@example.com", "Admin Person", "bob@example.com", "Bob Person", "bob own note",
                  "alice note on bob account"],
        )
        deleted = await _deletion_event(db, alice.id)
        assert deleted.event_metadata == {"by": AccountDeletedBy.ADMIN, "actor_id": str(admin.id)}
        assert (deleted.ip_address, deleted.user_agent) == ("203.0.113.7", "admin-console")
    assert prepare.prepared == [alice.id]
    assert prepare.committed == [alice.id]


@pytest.mark.asyncio
async def test_a_refused_admin_delete_keeps_the_user_and_their_history(engine: AsyncEngine) -> None:
    prepare = _Prepare(refuse=True)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        admin, alice, _bob = await _seed(db)

        assert await _delete_as(_app(engine, admin, prepare), admin, alice.id, _GATE_PASS_HEADERS) == 409

        db.expunge_all()
        assert await db.get(_User, alice.id) is not None
        assert_audit_erased(await audit_values(db), erased=[], kept=["alice@example.com", "alice private note"])


@pytest.mark.asyncio
async def test_a_non_superuser_cannot_delete_or_erase_anyone(engine: AsyncEngine) -> None:
    prepare = _Prepare()
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        _admin, alice, bob = await _seed(db)

        assert await _delete_as(_app(engine, bob, prepare), bob, alice.id, _GATE_PASS_HEADERS) == 403

        db.expunge_all()
        assert await db.get(_User, alice.id) is not None
        assert_audit_erased(await audit_values(db), erased=[], kept=["alice@example.com", "alice private note"])
    assert prepare.prepared == []


@pytest.mark.asyncio
async def test_a_user_deleted_while_waiting_for_the_lock_is_not_found_and_nothing_runs(engine: AsyncEngine) -> None:
    prepare = _Prepare()
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        admin, alice, _bob = await _seed(db)

        with patch("platform_shared.services.account_deletion.user_repo.lock_by_id", AsyncMock(return_value=None)):
            status = await _delete_as(_app(engine, admin, prepare), admin, alice.id, _GATE_PASS_HEADERS)

        assert status == 404
        db.expunge_all()
        assert await db.get(_User, alice.id) is not None
        assert_audit_erased(await audit_values(db), erased=[], kept=["alice@example.com", "alice private note"])
    assert prepare.prepared == []


@pytest.mark.parametrize("deleted_by", [AccountDeletedBy.SELF, AccountDeletedBy.ADMIN])
@pytest.mark.asyncio
async def test_the_deletion_event_records_who_deleted_and_from_where(engine: AsyncEngine, deleted_by: str) -> None:
    request = Request({
        "type": "http", "client": ("198.51.100.4", 4000),
        "headers": [(b"user-agent", b"deleting-browser")],
    })
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        admin, alice, _bob = await _seed(db)
        actor = alice if deleted_by == AccountDeletedBy.SELF else admin

        await delete_account_and_erase_history(
            db, alice, None, request=request, deleted_by=deleted_by, actor_id=actor.id,
        )
        await db.commit()

        deleted = await _deletion_event(db, alice.id)
        assert deleted.event_metadata == {"by": deleted_by, "actor_id": str(actor.id)}
        assert (deleted.ip_address, deleted.user_agent) == ("198.51.100.4", "deleting-browser")
