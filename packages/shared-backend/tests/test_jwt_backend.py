"""Tests for ``platform_shared.auth.jwt_backend``.

Pinned to the real bug: PR #555 added the strict-superuser gate which
demands an ``iat`` claim, but fastapi-users' default ``JWTStrategy``
emits only ``sub``/``aud``/``exp``. The result was every gated endpoint
(Demo create, toggle_superuser, etc.) returning 401 "Token missing or
unreadable iat claim" against real platform-issued tokens. These tests
lock in that platform-issued tokens are loadable by the gate's
``decode_token_auth_time`` callable.

The gate has since moved from ``iat`` to ``auth_time``, so that a token renewed
without a login can't pass as a recent login.
"""
from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import jwt
import pytest
import pytest_asyncio
from fastapi import Request
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy import Uuid
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.auth.jwt_backend import (
    IatJWTStrategy,
    build_jwt_auth_backend,
)
from platform_shared.core.permissions import make_decode_token_auth_time

SECRET = "test-secret-key-for-jwt-backend-tests-32bytes"


class _Base(DeclarativeBase):
    pass


class _Session(_Base):
    """The columns of an app's ``RefreshSession`` that the phone-session check reads."""

    __tablename__ = "refresh_sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)


class _FakeUser:
    def __init__(self, auth_valid_after: datetime | None = None) -> None:
        self.id = uuid.uuid4()
        self.auth_valid_after = auth_valid_after


class _FakeManager:
    """``db`` is where the user's phone sessions are. Without it, reading one fails."""

    def __init__(self, user: _FakeUser, db: AsyncSession | None = None) -> None:
        self.user = user
        if db is not None:
            self.user_db = SQLAlchemyUserDatabase(db, _Session)

    def parse_id(self, value: str) -> uuid.UUID:
        return uuid.UUID(value)

    async def get(self, _user_id: uuid.UUID) -> _FakeUser:
        return self.user


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(_Base.metadata.create_all)
    async with async_sessionmaker(engine)() as session:
        yield session
    await engine.dispose()


async def _add_session(db: AsyncSession, user: _FakeUser) -> uuid.UUID:
    session_id = uuid.uuid4()
    db.add(_Session(id=session_id, user_id=user.id))
    await db.flush()
    return session_id


def _strategy() -> IatJWTStrategy:
    return build_jwt_auth_backend(
        secret_key=SECRET, lifetime_seconds=3600, session_model=_Session,
    ).get_jwt_strategy()


async def _phone_token(user: _FakeUser, session_id: uuid.UUID) -> str:
    return await _strategy().write_session_token(
        user, auth_time=datetime.now(timezone.utc), session_id=session_id,
    )


async def _token_issued_at(user: _FakeUser, issued_at: int) -> str:
    return jwt.encode(
        {"sub": str(user.id), "aud": "fastapi-users:auth", "iat": issued_at, "exp": int(time.time()) + 3600},
        SECRET,
        algorithm="HS256",
    )


def _signed_token(**claims: int) -> str:
    return jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "fastapi-users:auth", "exp": int(time.time()) + 60, **claims},
        SECRET,
        algorithm="HS256",
    )


def _request_with(token: str) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )


def _decode_unchecked(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        SECRET,
        algorithms=["HS256"],
        audience="fastapi-users:auth",
    )


@pytest.mark.asyncio
async def test_write_token_includes_iat_claim() -> None:
    """Tokens MUST carry ``iat`` — the strict-superuser gate requires it."""
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600, session_model=_Session)
    strategy = backend.get_jwt_strategy()
    before = int(time.time())

    token = await strategy.write_token(_FakeUser())

    payload = _decode_unchecked(token)
    assert "iat" in payload, "iat claim missing — strict-superuser gate will 401"
    assert isinstance(payload["iat"], int)
    assert before <= payload["iat"] <= int(time.time())


@pytest.mark.asyncio
async def test_a_login_token_records_the_login_time() -> None:
    before = int(time.time())

    payload = _decode_unchecked(await _strategy().write_token(_FakeUser()))

    assert isinstance(payload["auth_time"], int)
    assert before <= payload["auth_time"] <= int(time.time())


@pytest.mark.asyncio
async def test_write_token_preserves_standard_claims() -> None:
    """The fix MUST NOT drop sub/aud/exp."""
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600, session_model=_Session)
    strategy = backend.get_jwt_strategy()
    user = _FakeUser()

    token = await strategy.write_token(user)

    payload = _decode_unchecked(token)
    assert payload["sub"] == str(user.id)
    assert payload["aud"] == ["fastapi-users:auth"]
    assert "exp" in payload
    assert payload["exp"] > payload["iat"]


@pytest.mark.asyncio
async def test_factory_returns_iat_strategy() -> None:
    """The factory MUST instantiate the iat-emitting subclass.

    A future refactor that swaps ``IatJWTStrategy`` back to the upstream
    ``JWTStrategy`` would silently re-introduce the bug; pin the type.
    """
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600, session_model=_Session)
    assert isinstance(backend.get_jwt_strategy(), IatJWTStrategy)


@pytest.mark.asyncio
async def test_auth_time_roundtrips_through_decode_token_auth_time() -> None:
    """The gate's reader MUST see the value the strategy writes.

    Catches mismatches in audience, algorithm, or secret-key plumbing
    between issue-side and verify-side.
    """
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600, session_model=_Session)
    strategy = backend.get_jwt_strategy()
    token = await strategy.write_token(_FakeUser())

    decode = make_decode_token_auth_time(secret_key=SECRET)

    auth_time = decode(_request_with(token))
    assert auth_time is not None, "decode_token_auth_time returned None on a freshly-issued token"
    assert auth_time == _decode_unchecked(token)["auth_time"]
    assert abs(auth_time - time.time()) < 5


def test_gate_reads_the_login_time_not_the_issue_time() -> None:
    """A token renewed long after the login must not pass as a recent login."""
    logged_in_at = int(time.time()) - 7200
    token = _signed_token(iat=int(time.time()), auth_time=logged_in_at)

    assert make_decode_token_auth_time(secret_key=SECRET)(_request_with(token)) == logged_in_at


def test_gate_does_not_fall_back_to_the_issue_time() -> None:
    token = _signed_token(iat=int(time.time()))

    assert make_decode_token_auth_time(secret_key=SECRET)(_request_with(token)) is None


@pytest.mark.asyncio
async def test_token_works_when_user_has_no_cutoff() -> None:
    """NULL means no cutoff: nobody is signed out when this first deploys."""
    user = _FakeUser()
    token = await _token_issued_at(user, int(time.time()) - 1000)
    assert await _strategy().read_token(token, _FakeManager(user)) is user


@pytest.mark.asyncio
async def test_token_from_before_the_cutoff_is_rejected() -> None:
    cutoff = 1_700_000_000
    user = _FakeUser(datetime.fromtimestamp(cutoff, timezone.utc))
    token = await _token_issued_at(user, cutoff - 1)
    assert await _strategy().read_token(token, _FakeManager(user)) is None


@pytest.mark.asyncio
async def test_token_from_the_same_second_as_the_cutoff_works() -> None:
    """The token issued right after a password change mustn't sign someone out."""
    cutoff = 1_700_000_000
    user = _FakeUser(datetime.fromtimestamp(cutoff + 0.9, timezone.utc))
    token = await _token_issued_at(user, cutoff)
    assert await _strategy().read_token(token, _FakeManager(user)) is user


@pytest.mark.asyncio
async def test_token_after_the_cutoff_works() -> None:
    cutoff = 1_700_000_000
    user = _FakeUser(datetime.fromtimestamp(cutoff, timezone.utc))
    token = await _token_issued_at(user, cutoff + 1)
    assert await _strategy().read_token(token, _FakeManager(user)) is user


@pytest.mark.asyncio
async def test_token_with_no_iat_is_rejected_once_there_is_a_cutoff() -> None:
    user = _FakeUser(datetime.fromtimestamp(1_700_000_000, timezone.utc))
    token = jwt.encode(
        {"sub": str(user.id), "aud": "fastapi-users:auth", "exp": int(time.time()) + 3600},
        SECRET,
        algorithm="HS256",
    )
    assert await _strategy().read_token(token, _FakeManager(user)) is None


@pytest.mark.asyncio
async def test_missing_token_still_reads_as_no_user() -> None:
    assert await _strategy().read_token(None, _FakeManager(_FakeUser())) is None


@pytest.mark.asyncio
async def test_a_phone_token_names_its_session() -> None:
    session_id = uuid.uuid4()
    token = await _strategy().write_session_token(
        _FakeUser(), auth_time=datetime.now(timezone.utc), session_id=session_id,
    )
    assert _decode_unchecked(token)["sid"] == str(session_id)
    assert _strategy().session_id_of(token) == session_id


@pytest.mark.asyncio
async def test_a_web_token_names_no_session() -> None:
    token = await _strategy().write_token(_FakeUser())
    assert "sid" not in _decode_unchecked(token)
    assert _strategy().session_id_of(token) is None


def test_a_malformed_session_id_reads_as_none() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "fastapi-users:auth", "sid": "not-a-uuid"}, SECRET, algorithm="HS256",
    )
    assert _strategy().session_id_of(token) is None


def test_another_servers_token_names_no_session() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "fastapi-users:auth", "sid": str(uuid.uuid4())},
        "some-other-secret-that-is-long-enough",
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidSignatureError):
        _strategy().session_id_of(token)


@pytest.mark.asyncio
async def test_a_reissued_token_outlives_a_cutoff_and_keeps_everything_else(db: AsyncSession) -> None:
    """After a cutoff the caller carries on: same sign-in time, session and lifetime."""
    user = _FakeUser()
    session_id = str(await _add_session(db, user))
    now = int(time.time())
    old = jwt.encode(
        {"sub": str(user.id), "aud": "fastapi-users:auth", "iat": now - 600, "exp": now - 600 + 1800,
         "auth_time": now - 7200, "sid": session_id},
        SECRET,
        algorithm="HS256",
    )
    user.auth_valid_after = datetime.fromtimestamp(now - 5, timezone.utc)
    assert await _strategy().read_token(old, _FakeManager(user, db)) is None

    new = await _strategy().reissue(user, old)

    claims = _decode_unchecked(new)
    assert claims["iat"] >= now
    assert claims["exp"] - claims["iat"] == 1800, "A phone's token must not get the web lifetime."
    assert claims["auth_time"] == now - 7200
    assert claims["sid"] == session_id
    assert claims["sub"] == str(user.id)
    assert await _strategy().read_token(new, _FakeManager(user, db)) is user


@pytest.mark.asyncio
async def test_a_token_that_expired_while_the_request_ran_is_still_reissued() -> None:
    user = _FakeUser()
    now = int(time.time())
    old = jwt.encode(
        {"sub": str(user.id), "aud": "fastapi-users:auth", "iat": now - 3600, "exp": now - 1, "auth_time": now - 3600},
        SECRET,
        algorithm="HS256",
    )
    claims = _decode_unchecked(await _strategy().reissue(user, old))
    assert claims["exp"] - claims["iat"] == 3599
    assert "sid" not in claims


@pytest.mark.asyncio
async def test_a_reissued_token_without_a_login_time_proves_no_recent_login() -> None:
    user = _FakeUser()
    claims = _decode_unchecked(await _strategy().reissue(user, _signed_token(iat=int(time.time()))))
    assert claims["auth_time"] == 0


@pytest.mark.asyncio
async def test_a_phone_token_works_while_its_session_exists(db: AsyncSession) -> None:
    user = _FakeUser()
    token = await _phone_token(user, await _add_session(db, user))
    assert await _strategy().read_token(token, _FakeManager(user, db)) is user


@pytest.mark.asyncio
async def test_a_phone_token_stops_working_once_its_session_is_signed_out(db: AsyncSession) -> None:
    """Signing a device out deletes its session: its access token mustn't last 30 more minutes."""
    user = _FakeUser()
    session_id = await _add_session(db, user)
    token = await _phone_token(user, session_id)

    await db.delete(await db.get(_Session, session_id))
    await db.flush()

    assert await _strategy().read_token(token, _FakeManager(user, db)) is None


@pytest.mark.asyncio
async def test_signing_out_one_phone_leaves_the_others_signed_in(db: AsyncSession) -> None:
    user = _FakeUser()
    signed_out, other = await _add_session(db, user), await _add_session(db, user)
    other_token = await _phone_token(user, other)

    await db.delete(await db.get(_Session, signed_out))
    await db.flush()

    assert await _strategy().read_token(other_token, _FakeManager(user, db)) is user


@pytest.mark.asyncio
async def test_a_phone_token_naming_another_users_session_is_refused(db: AsyncSession) -> None:
    user, stranger = _FakeUser(), _FakeUser()
    token = await _phone_token(user, await _add_session(db, stranger))
    assert await _strategy().read_token(token, _FakeManager(user, db)) is None


@pytest.mark.asyncio
async def test_a_phone_token_with_a_malformed_session_is_refused(db: AsyncSession) -> None:
    user = _FakeUser()
    token = jwt.encode(
        {"sub": str(user.id), "aud": "fastapi-users:auth", "exp": int(time.time()) + 60, "sid": "not-a-uuid"},
        SECRET,
        algorithm="HS256",
    )
    assert await _strategy().read_token(token, _FakeManager(user, db)) is None


@pytest.mark.asyncio
async def test_a_strategy_that_cant_check_sessions_refuses_phone_tokens(db: AsyncSession) -> None:
    user = _FakeUser()
    token = await _phone_token(user, await _add_session(db, user))
    strategy = IatJWTStrategy(secret=SECRET, lifetime_seconds=3600)
    assert await strategy.read_token(token, _FakeManager(user, db)) is None


@pytest.mark.asyncio
async def test_a_web_token_needs_no_session_lookup() -> None:
    """Web tokens carry no ``sid``: no database read, and they work as before."""
    user = _FakeUser()
    token = await _strategy().write_token(user)
    assert await _strategy().read_token(token, _FakeManager(user)) is user
