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
from datetime import datetime, timezone
from typing import Any

import jwt
import pytest
from fastapi import Request

from platform_shared.auth.jwt_backend import (
    IatJWTStrategy,
    build_jwt_auth_backend,
)
from platform_shared.core.permissions import make_decode_token_auth_time

SECRET = "test-secret-key-for-jwt-backend-tests-32bytes"


class _FakeUser:
    def __init__(self, auth_valid_after: datetime | None = None) -> None:
        self.id = uuid.uuid4()
        self.auth_valid_after = auth_valid_after


class _FakeManager:
    def __init__(self, user: _FakeUser) -> None:
        self.user = user

    def parse_id(self, value: str) -> uuid.UUID:
        return uuid.UUID(value)

    async def get(self, _user_id: uuid.UUID) -> _FakeUser:
        return self.user


def _strategy() -> IatJWTStrategy:
    return build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600).get_jwt_strategy()


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
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600)
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
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600)
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
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600)
    assert isinstance(backend.get_jwt_strategy(), IatJWTStrategy)


@pytest.mark.asyncio
async def test_auth_time_roundtrips_through_decode_token_auth_time() -> None:
    """The gate's reader MUST see the value the strategy writes.

    Catches mismatches in audience, algorithm, or secret-key plumbing
    between issue-side and verify-side.
    """
    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600)
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
