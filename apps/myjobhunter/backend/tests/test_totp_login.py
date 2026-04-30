"""TOTP login challenge — POST /auth/totp/login.

Covers:
  * Non-TOTP user: gets a JWT directly (single round trip).
  * TOTP-enabled user, no code: 200 with ``{"detail": "totp_required"}``.
  * TOTP-enabled user, valid code: 200 with JWT.
  * Recovery-code login: consumed code is removed and cannot be reused.
  * Bad credentials / bad totp_code: surface the documented detail strings.
  * Auth events written on each branch.
"""
import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from platform_shared.core.auth_events import AuthEventType


async def _enroll_totp(client: AsyncClient, user, as_user) -> str:
    """Drive a user through enrollment and return the plaintext TOTP secret."""
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        await authed.post(
            "/auth/totp/verify",
            json={"code": pyotp.TOTP(secret).now()},
        )
    return secret


async def _read_auth_events(user_id: str) -> list[dict]:
    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(eng, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            rows = await sess.execute(
                text(
                    "SELECT event_type, succeeded FROM auth_events "
                    "WHERE user_id = :uid ORDER BY created_at",
                ),
                {"uid": user_id},
            )
            out = [dict(r._mapping) for r in rows]
    await eng.dispose()
    return out


@pytest.mark.asyncio
async def test_login_no_totp_returns_jwt(
    client: AsyncClient, user_factory,
) -> None:
    user = await user_factory()
    resp = await client.post(
        "/auth/totp/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("access_token")
    assert body.get("token_type") == "bearer"
    assert "detail" not in body


@pytest.mark.asyncio
async def test_login_totp_enabled_no_code_returns_required(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    await _enroll_totp(client, user, as_user)

    resp = await client.post(
        "/auth/totp/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"detail": "totp_required"}


@pytest.mark.asyncio
async def test_login_with_valid_totp_returns_jwt(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    secret = await _enroll_totp(client, user, as_user)

    resp = await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("access_token")
    assert body.get("token_type") == "bearer"


@pytest.mark.asyncio
async def test_login_with_invalid_totp_returns_invalid_totp(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    await _enroll_totp(client, user, as_user)

    resp = await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": "000000",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_totp"


@pytest.mark.asyncio
async def test_login_with_bad_password_returns_bad_credentials(
    client: AsyncClient, user_factory,
) -> None:
    user = await user_factory()
    resp = await client.post(
        "/auth/totp/login",
        json={"email": user["email"], "password": "wrong-password-123"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "LOGIN_BAD_CREDENTIALS"


@pytest.mark.asyncio
async def test_recovery_code_accepted_and_consumed(
    client: AsyncClient, user_factory, as_user,
) -> None:
    """Recovery codes are alphanumeric, not 6-digit. Use one, confirm it's
    consumed (cannot be reused), and confirm subsequent valid TOTP still works."""
    user = await user_factory()
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        recovery_codes = setup.json()["recovery_codes"]
        await authed.post(
            "/auth/totp/verify",
            json={"code": pyotp.TOTP(secret).now()},
        )

    # Use the first recovery code
    first_code = recovery_codes[0]
    resp = await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": first_code,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json().get("access_token") is not None

    # Reuse should be rejected — recovery codes are single-use
    resp_reuse = await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": first_code,
        },
    )
    assert resp_reuse.status_code == 400
    assert resp_reuse.json()["detail"] == "invalid_totp"

    # A different recovery code should still work
    second_code = recovery_codes[1]
    resp_second = await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": second_code,
        },
    )
    assert resp_second.status_code == 200


@pytest.mark.asyncio
async def test_standard_jwt_login_blocks_totp_enabled_user(
    client: AsyncClient, user_factory, as_user,
) -> None:
    """The standard /auth/jwt/login endpoint must NOT issue a token for a
    TOTP-enabled user — they have to use /auth/totp/login. This is the
    server-side enforcement that prevents bypassing the TOTP gate."""
    user = await user_factory()
    await _enroll_totp(client, user, as_user)

    resp = await client.post(
        "/auth/jwt/login",
        data={"username": user["email"], "password": user["password"]},
    )
    # fastapi-users returns 400 LOGIN_BAD_CREDENTIALS when authenticate returns None
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_auth_events_written_on_totp_login_success(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    secret = await _enroll_totp(client, user, as_user)
    await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    events = await _read_auth_events(user["id"])
    types = [e["event_type"] for e in events]
    assert AuthEventType.TOTP_ENABLED in types
    assert AuthEventType.TOTP_VERIFY_SUCCESS in types
    assert AuthEventType.LOGIN_SUCCESS in types


@pytest.mark.asyncio
async def test_auth_events_written_on_totp_recovery_used(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        recovery_codes = setup.json()["recovery_codes"]
        await authed.post(
            "/auth/totp/verify",
            json={"code": pyotp.TOTP(secret).now()},
        )
    await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": recovery_codes[0],
        },
    )
    events = await _read_auth_events(user["id"])
    types = [e["event_type"] for e in events]
    assert AuthEventType.TOTP_RECOVERY_USED in types


@pytest.mark.asyncio
async def test_auth_events_written_on_invalid_totp(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    await _enroll_totp(client, user, as_user)
    await client.post(
        "/auth/totp/login",
        json={
            "email": user["email"],
            "password": user["password"],
            "totp_code": "000000",
        },
    )
    events = await _read_auth_events(user["id"])
    types_succeeded = [(e["event_type"], e["succeeded"]) for e in events]
    assert (AuthEventType.TOTP_VERIFY_FAILURE, False) in types_succeeded
