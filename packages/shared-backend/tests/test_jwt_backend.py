"""Tests for ``platform_shared.auth.jwt_backend``.

Pinned to the real bug: PR #555 added the strict-superuser gate which
demands an ``iat`` claim, but fastapi-users' default ``JWTStrategy``
emits only ``sub``/``aud``/``exp``. The result was every gated endpoint
(Demo create, toggle_superuser, etc.) returning 401 "Token missing or
unreadable iat claim" against real platform-issued tokens. These tests
lock in that platform-issued tokens are loadable by the gate's
``decode_token_iat`` callable.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

import jwt
import pytest

from platform_shared.auth.jwt_backend import (
    IatJWTStrategy,
    build_jwt_auth_backend,
)
from platform_shared.core.permissions import make_decode_token_iat

SECRET = "test-secret-key-for-jwt-backend-tests-32bytes"


class _FakeUser:
    def __init__(self) -> None:
        self.id = uuid.uuid4()


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
async def test_iat_roundtrips_through_decode_token_iat() -> None:
    """The gate's iat reader MUST see the value the strategy writes.

    Catches mismatches in audience, algorithm, or secret-key plumbing
    between issue-side and verify-side.
    """
    from fastapi import Request

    backend = build_jwt_auth_backend(secret_key=SECRET, lifetime_seconds=3600)
    strategy = backend.get_jwt_strategy()
    token = await strategy.write_token(_FakeUser())

    decode = make_decode_token_iat(secret_key=SECRET)
    request = Request(
        {
            "type": "http",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )

    iat = decode(request)
    assert iat is not None, "decode_token_iat returned None on a freshly-issued token"
    assert abs(iat - time.time()) < 5
