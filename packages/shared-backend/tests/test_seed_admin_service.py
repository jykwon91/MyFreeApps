"""Unit tests for ``platform_shared.services.seed_admin_service``.

Mocks the session / unit-of-work (same approach as test_admin_user_service)
so the seeding business rules — create, seed-owned promote, hash-mismatch
refusal, config validation — are exercised without a real DB.
"""
from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import Boolean, Enum as SAEnum, String, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.permissions import Role
from platform_shared.services.seed_admin_service import (
    SeedAdminInvalidEmailError,
    SeedAdminInvalidHashError,
    SeedAdminNotConfiguredError,
    build_seed_admin_hook,
    is_bcrypt_hash,
    is_reserved_seed_email,
    seed_admin_user,
)

# A structurally valid bcrypt hash (passlib shape: $2b$ + cost + 53 chars).
VALID_HASH = "$2b$12$" + "a" * 53
OTHER_HASH = "$2b$12$" + "b" * 53


class _Base(DeclarativeBase):
    """Test-local declarative base — keeps the fake table out of the shared
    platform_shared Base.metadata."""


class _FakeUser(_Base):
    """Minimal mapped stand-in for an app's User model. A real mapped class
    (not a plain fake) because the service builds ``select(user_model)``.
    The session is mocked, so no table is ever created."""

    __tablename__ = "seed_admin_test_users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[Role] = mapped_column(SAEnum(Role), default=Role.USER)


def _db_returning(existing: _FakeUser | None) -> MagicMock:
    """Mock AsyncSession whose SELECT returns *existing*."""
    db = MagicMock(name="db")
    result = MagicMock()
    result.scalars.return_value.first.return_value = existing
    db.execute = AsyncMock(return_value=result)
    db.flush = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture()
def logged_events() -> list[dict]:
    """Patch log_auth_event, capturing the calls."""
    events: list[dict] = []

    async def _capture(db, **kwargs):
        events.append(kwargs)

    with patch(
        "platform_shared.services.seed_admin_service.log_auth_event",
        side_effect=_capture,
    ):
        yield events


# ---------------------------------------------------------------------------
# Hash / email / reservation helpers
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_valid_bcrypt_variants_accepted(self):
        for prefix in ("$2a$", "$2b$", "$2y$"):
            assert is_bcrypt_hash(prefix + "12$" + "a" * 53) is True

    def test_plaintext_and_mangled_values_rejected(self):
        assert is_bcrypt_hash("hunter2-plaintext-password") is False
        assert is_bcrypt_hash("") is False
        # shell ate the $s
        assert is_bcrypt_hash("2b12" + "a" * 53) is False
        # truncated hash
        assert is_bcrypt_hash("$2b$12$" + "a" * 30) is False

    def test_reserved_email_case_insensitive(self):
        assert is_reserved_seed_email("Admin@Example.com", "admin@example.com")
        assert is_reserved_seed_email(" admin@example.com ", "admin@example.com")
        assert not is_reserved_seed_email("other@example.com", "admin@example.com")

    def test_empty_reservation_reserves_nothing(self):
        assert not is_reserved_seed_email("admin@example.com", "")
        assert not is_reserved_seed_email("", "")


# ---------------------------------------------------------------------------
# seed_admin_user
# ---------------------------------------------------------------------------


class TestSeedAdminUser:
    @pytest.mark.asyncio
    async def test_creates_verified_superuser_admin_when_missing(self, logged_events):
        db = _db_returning(None)

        action = await seed_admin_user(
            db, user_model=_FakeUser,
            email="admin@example.com", password_hash=VALID_HASH,
        )

        assert action == "created"
        created = db.add.call_args[0][0]
        assert created.email == "admin@example.com"
        assert created.hashed_password == VALID_HASH
        assert created.is_active is True
        assert created.is_superuser is True
        assert created.is_verified is True
        assert created.role == Role.ADMIN
        assert [e["event_type"] for e in logged_events] == [
            AuthEventType.SEED_ADMIN_CREATED,
        ]

    @pytest.mark.asyncio
    async def test_promotes_seed_owned_row(self, logged_events):
        existing = _FakeUser(
            email="admin@example.com", hashed_password=VALID_HASH,
            role=Role.USER, is_active=True, is_superuser=False, is_verified=False,
        )
        db = _db_returning(existing)

        action = await seed_admin_user(
            db, user_model=_FakeUser,
            email="admin@example.com", password_hash=VALID_HASH,
        )

        assert action == "promoted"
        assert existing.role == Role.ADMIN
        assert existing.is_superuser is True
        assert existing.is_verified is True
        assert [e["event_type"] for e in logged_events] == [
            AuthEventType.SEED_ADMIN_PROMOTED,
        ]

    @pytest.mark.asyncio
    async def test_second_boot_is_a_silent_noop(self, logged_events):
        existing = _FakeUser(
            email="admin@example.com", hashed_password=VALID_HASH,
            role=Role.ADMIN, is_active=True, is_superuser=True, is_verified=True,
        )
        db = _db_returning(existing)

        action = await seed_admin_user(
            db, user_model=_FakeUser,
            email="admin@example.com", password_hash=VALID_HASH,
        )

        assert action == "unchanged"
        assert logged_events == []  # no audit row spam on every boot
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_refuses_to_promote_hash_mismatch(self, logged_events, caplog):
        """A row with the seed email but a different hash is NOT seed-owned —
        squatted address (or in-app password change). Must not be touched."""
        existing = _FakeUser(
            email="admin@example.com", hashed_password=OTHER_HASH,
            role=Role.USER, is_active=True, is_superuser=False, is_verified=False,
        )
        db = _db_returning(existing)

        with caplog.at_level(logging.ERROR):
            action = await seed_admin_user(
                db, user_model=_FakeUser,
                email="admin@example.com", password_hash=VALID_HASH,
            )

        assert action == "refused"
        assert existing.role == Role.USER
        assert existing.is_superuser is False
        assert existing.is_verified is False
        assert [e["event_type"] for e in logged_events] == [
            AuthEventType.SEED_ADMIN_REFUSED,
        ]
        assert logged_events[0]["succeeded"] is False
        # Never log either hash value.
        assert VALID_HASH not in caplog.text
        assert OTHER_HASH not in caplog.text


# ---------------------------------------------------------------------------
# build_seed_admin_hook — config validation
# ---------------------------------------------------------------------------


def _hook(
    *,
    email: str = "",
    password_hash: str = "",
    environment: str = "development",
    required: bool = False,
    db: MagicMock | None = None,
):
    settings = SimpleNamespace(
        seed_admin_email=email,
        seed_admin_password_hash=password_hash,
        environment=environment,
    )
    db = db if db is not None else _db_returning(None)

    @asynccontextmanager
    async def fake_uow():
        yield db

    hook = build_seed_admin_hook(
        settings=settings, unit_of_work=fake_uow,
        user_model=_FakeUser, required=required,
    )
    return hook, db


class TestBuildSeedAdminHook:
    @pytest.mark.asyncio
    async def test_unset_vars_skip_silently_by_default(self, logged_events):
        hook, db = _hook()
        await hook()
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_unset_vars_raise_in_prod_when_required(self):
        hook, _ = _hook(environment="production", required=True)
        with pytest.raises(SeedAdminNotConfiguredError):
            await hook()

    @pytest.mark.asyncio
    async def test_unset_vars_skip_in_prod_when_not_required(self, logged_events):
        hook, db = _hook(environment="production", required=False)
        await hook()
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_half_configured_raises_in_prod_even_when_not_required(self):
        hook, _ = _hook(
            email="admin@example.com", environment="production", required=False,
        )
        with pytest.raises(SeedAdminNotConfiguredError):
            await hook()

    @pytest.mark.asyncio
    async def test_half_configured_skips_in_dev(self):
        hook, db = _hook(password_hash=VALID_HASH)
        await hook()
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_email_raises_in_prod(self):
        hook, _ = _hook(
            email="dev@localhost", password_hash=VALID_HASH,
            environment="production",
        )
        with pytest.raises(SeedAdminInvalidEmailError):
            await hook()

    @pytest.mark.asyncio
    async def test_invalid_hash_raises_in_prod_without_echoing_value(self):
        hook, _ = _hook(
            email="admin@example.com", password_hash="plaintext-oops",
            environment="production",
        )
        with pytest.raises(SeedAdminInvalidHashError) as exc_info:
            await hook()
        assert "plaintext-oops" not in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_invalid_hash_skips_in_dev_without_logging_value(self, caplog):
        hook, db = _hook(email="admin@example.com", password_hash="plaintext-oops")
        with caplog.at_level(logging.ERROR):
            await hook()
        db.execute.assert_not_called()
        assert "plaintext-oops" not in caplog.text

    @pytest.mark.asyncio
    async def test_fully_configured_seeds_through_unit_of_work(self, logged_events):
        hook, db = _hook(
            email="admin@example.com", password_hash=VALID_HASH,
            environment="production", required=True,
        )
        await hook()
        db.add.assert_called_once()
        assert [e["event_type"] for e in logged_events] == [
            AuthEventType.SEED_ADMIN_CREATED,
        ]
