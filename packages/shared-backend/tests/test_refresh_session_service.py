"""A device stays signed in through rotation and lost responses, and no further."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import ForeignKey
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.auth.refresh_session import RefreshSessionMixin
from platform_shared.auth.refresh_token import (
    format_refresh_token,
    hash_refresh_secret,
    parse_refresh_token,
)
from platform_shared.core.refresh_session_limits import REFRESH_SESSION_PREVIOUS_SECRET_SECONDS
from platform_shared.repositories.refresh_session_repo import _locked_select
from platform_shared.services.refresh_session_service import RefreshSessionService

class _Base(DeclarativeBase):
    pass


class _User(_Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class _Session(RefreshSessionMixin, _Base):
    __tablename__ = "refresh_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))


_KEY = "test-signing-key"


def _user(**overrides: Any) -> SimpleNamespace:
    return SimpleNamespace(
        **({"id": uuid.uuid4(), "is_active": True, "auth_valid_after": None} | overrides)
    )


class _Device:
    """One issued session, served to the service as if from the database."""

    def __init__(self, user: SimpleNamespace | None = None) -> None:
        self.user = user or _user()
        self.db = MagicMock(execute=AsyncMock(), delete=AsyncMock())
        self.row: _Session | None = None
        self.service = RefreshSessionService(
            session_model=_Session,
            user_model=_User,
            signing_key=_KEY,
            unit_of_work_factory=self._unit_of_work,
        )

    @asynccontextmanager
    async def _unit_of_work(self) -> AsyncIterator[MagicMock]:
        yield self.db

    async def sign_in(self) -> str:
        issued = await self.service.issue(self.user, device_name="Phone")
        self.row = issued.session
        return issued.refresh_token

    async def refresh(self, token: str) -> str | None:
        with (
            patch(
                "platform_shared.services.refresh_session_service.refresh_session_repo.lock_by_id",
                AsyncMock(return_value=self.row),
            ),
            patch(
                "platform_shared.services.refresh_session_service.user_repo.get_by_id",
                AsyncMock(return_value=self.user),
            ),
        ):
            result = await self.service.rotate(token)
        return None if result is None else result.refresh_token


@pytest.mark.asyncio
async def test_signing_in_stores_only_a_hash_of_the_secret() -> None:
    device = _Device()
    token = await device.sign_in()
    parsed = parse_refresh_token(token, _KEY)
    assert parsed is not None
    assert parsed[0] == device.row.id
    assert parsed[1] not in (device.row.current_secret_hash, device.row.previous_secret_hash)
    assert device.row.current_secret_hash == hash_refresh_secret(parsed[1])


@pytest.mark.asyncio
async def test_each_refresh_gives_a_new_token_that_works() -> None:
    device = _Device()
    first = await device.sign_in()
    second = await device.refresh(first)
    assert second is not None and second != first
    assert await device.refresh(second) is not None


@pytest.mark.asyncio
async def test_a_lost_response_doesnt_sign_the_device_out() -> None:
    device = _Device()
    first = await device.sign_in()
    assert await device.refresh(first) is not None  # the response never arrives
    retried = await device.refresh(first)
    assert retried is not None
    assert await device.refresh(retried) is not None


@pytest.mark.asyncio
async def test_a_token_stops_working_once_the_client_uses_its_replacement() -> None:
    device = _Device()
    first = await device.sign_in()
    second = await device.refresh(first)
    assert await device.refresh(second) is not None
    assert await device.refresh(first) is None


@pytest.mark.asyncio
async def test_a_replaced_token_ends_the_session_after_the_grace_period() -> None:
    device = _Device()
    first = await device.sign_in()
    assert await device.refresh(first) is not None
    device.row.previous_valid_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert await device.refresh(first) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_a_stolen_token_ends_the_session_when_the_owner_comes_back() -> None:
    device = _Device()
    stolen = await device.sign_in()
    owners_token = await device.refresh(stolen)
    thiefs_token = await device.refresh(stolen)
    assert thiefs_token is not None

    assert await device.refresh(owners_token) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_detection_survives_the_thief_refreshing_again() -> None:
    device = _Device()
    stolen = await device.sign_in()
    owners_token = await device.refresh(stolen)
    assert await device.refresh(await device.refresh(stolen)) is not None

    assert await device.refresh(owners_token) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_replaying_the_stolen_token_cannot_erase_the_evidence() -> None:
    device = _Device()
    stolen = await device.sign_in()
    owners_token = await device.refresh(stolen)
    assert await device.refresh(stolen) is not None
    assert await device.refresh(stolen) is not None

    assert await device.refresh(owners_token) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_evidence_survives_a_replay_of_a_later_token() -> None:
    device = _Device()
    stolen = await device.sign_in()
    owners_token = await device.refresh(stolen)
    thiefs_token = await device.refresh(stolen)
    assert await device.refresh(thiefs_token) is not None
    assert await device.refresh(thiefs_token) is not None

    assert await device.refresh(owners_token) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_a_thief_refreshing_twice_is_caught_when_the_owner_returns() -> None:
    device = _Device()
    owners_token = await device.sign_in()
    assert await device.refresh(await device.refresh(owners_token)) is not None

    assert await device.refresh(owners_token) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_many_lost_responses_never_end_a_session() -> None:
    device = _Device()
    first = await device.sign_in()
    await device.refresh(first)
    for _ in range(100):
        assert await device.refresh(first) is not None
    device.db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_token_we_did_not_sign_changes_nothing() -> None:
    device = _Device()
    await device.sign_in()
    forged = format_refresh_token(device.row.id, "guess", "not-our-key")
    assert await device.refresh(forged) is None
    assert await device.refresh(f"{device.row.id}.guess") is None
    device.db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_retry_after_a_lost_response_ends_nothing() -> None:
    device = _Device()
    first = await device.sign_in()
    await device.refresh(first)
    await device.refresh(await device.refresh(first))
    device.db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_the_grace_period_starts_at_the_refresh_and_retries_dont_extend_it() -> None:
    device = _Device()
    first = await device.sign_in()
    before = datetime.now(timezone.utc)
    await device.refresh(first)
    valid_until = device.row.previous_valid_until
    assert valid_until - before == pytest.approx(
        timedelta(seconds=REFRESH_SESSION_PREVIOUS_SECRET_SECONDS), abs=timedelta(seconds=5),
    )
    await device.refresh(first)
    assert device.row.previous_valid_until == valid_until


@pytest.mark.asyncio
async def test_a_thief_who_refreshed_first_is_shut_out_when_the_owner_retries() -> None:
    device = _Device()
    stolen = await device.sign_in()
    thiefs_token = await device.refresh(stolen)
    assert await device.refresh(stolen) is not None
    device.db.delete.assert_not_awaited()

    assert await device.refresh(thiefs_token) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_a_replaced_token_ends_a_session_that_is_already_unusable() -> None:
    device = _Device(_user(is_active=False))
    first = await device.sign_in()
    device.user.is_active = True
    second = await device.refresh(first)
    await device.refresh(second)
    device.user.is_active = False

    assert await device.refresh(first) is None
    device.db.delete.assert_awaited_once_with(device.row)


@pytest.mark.asyncio
async def test_a_valid_token_on_an_unusable_session_changes_nothing() -> None:
    device = _Device(_user(is_active=False))
    token = await device.sign_in()
    before = device.row.current_secret_hash

    assert await device.refresh(token) is None
    assert device.row.current_secret_hash == before
    device.db.delete.assert_not_awaited()


def test_a_service_needs_a_signing_key() -> None:
    with pytest.raises(ValueError):
        RefreshSessionService(
            session_model=_Session, user_model=_User, signing_key="", unit_of_work_factory=MagicMock(),
        )


def test_token_parsing_refuses_anything_but_what_was_issued() -> None:
    session_id = uuid.uuid4()
    token = format_refresh_token(session_id, "secret", _KEY)
    assert parse_refresh_token(token, _KEY) == (session_id, "secret")
    head, secret, signature = token.split(".")
    for bad in (
        f"{token}.extra",
        f"{head}.{secret}.{signature[:-1]}x",
        f"{head}.other.{signature}",
        f"{uuid.uuid4()}.{secret}.{signature}",
        f"{head}.\ud800.{signature}",
        f"{head}.{secret}.\ud800",
        f"{head}.{secret}.caf\u00e9",
        f"{{{head}}}.{secret}.{signature}",
        f"{head.upper()}.{secret}.{signature}",
        "",
    ):
        assert parse_refresh_token(bad, _KEY) is None, bad


@pytest.mark.asyncio
async def test_refreshing_keeps_the_original_login_time() -> None:
    device = _Device()
    token = await device.sign_in()
    login_time = device.row.auth_time
    assert await device.refresh(token) is not None
    assert device.row.auth_time == login_time


@pytest.mark.asyncio
@pytest.mark.parametrize("token", ["", "no-separator", "not-a-uuid.secret", f"{uuid.uuid4()}."])
async def test_a_malformed_token_is_refused(token: str) -> None:
    device = _Device()
    await device.sign_in()
    assert await device.refresh(token) is None
    device.db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_unknown_session_is_refused() -> None:
    device = _Device()
    token = await device.sign_in()
    device.row = None
    assert await device.refresh(token) is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "expire",
    [
        lambda row: setattr(row, "expires_at", datetime.now(timezone.utc) - timedelta(seconds=1)),
        lambda row: setattr(row, "last_used_at", datetime.now(timezone.utc) - timedelta(days=31)),
    ],
    ids=["past the absolute limit", "idle too long"],
)
async def test_an_expired_session_is_refused(expire: Any) -> None:
    device = _Device()
    token = await device.sign_in()
    expire(device.row)
    assert await device.refresh(token) is None


@pytest.mark.asyncio
async def test_a_disabled_user_cant_refresh() -> None:
    device = _Device()
    token = await device.sign_in()
    device.user.is_active = False
    assert await device.refresh(token) is None


@pytest.mark.asyncio
async def test_a_session_cutoff_ends_older_sessions_and_spares_newer_ones() -> None:
    device = _Device()
    token = await device.sign_in()
    device.user.auth_valid_after = device.row.created_at + timedelta(microseconds=1)
    assert await device.refresh(token) is None

    device.user.auth_valid_after = device.row.created_at
    assert await device.refresh(token) is not None


@pytest.mark.asyncio
async def test_the_device_list_leaves_out_sessions_that_cant_refresh() -> None:
    device = _Device()
    await device.sign_in()
    active = device.row
    await device.sign_in()
    expired = device.row
    expired.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    with patch(
        "platform_shared.services.refresh_session_service.refresh_session_repo.list_for_user",
        AsyncMock(return_value=[active, expired]),
    ):
        assert await device.service.list_active(device.db, device.user) == [active]


def test_the_refresh_lock_is_a_row_lock() -> None:
    sql = str(
        _locked_select(_Session, uuid.uuid4()).compile(dialect=postgresql.dialect())
    )
    assert "FOR UPDATE" in sql
