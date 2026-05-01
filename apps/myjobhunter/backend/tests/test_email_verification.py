"""Email verification flow:

- newly registered users are unverified
- login refused with detail="LOGIN_USER_NOT_VERIFIED"
- /auth/verify with a valid token flips is_verified to True
- after verification, login succeeds
- /auth/request-verify-token sends a new email (mocked)
"""
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_new_user_is_unverified(
    client: AsyncClient, user_factory, db: AsyncSession,
) -> None:
    user = await user_factory(verified=False)
    row = (
        await db.execute(
            text("SELECT is_verified FROM users WHERE email = :email"),
            {"email": user["email"]},
        )
    ).first()
    assert row is not None
    assert row[0] is False


@pytest.mark.asyncio
async def test_unverified_user_cannot_login(
    client: AsyncClient, user_factory,
) -> None:
    user = await user_factory(verified=False)
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "LOGIN_USER_NOT_VERIFIED"


@pytest.mark.asyncio
async def test_verify_token_flips_is_verified(
    client: AsyncClient, user_factory, db: AsyncSession,
) -> None:
    user = await user_factory(verified=False)

    # Capture the token by mocking send_email; the token is the second
    # positional argument fastapi-users passes to on_after_request_verify,
    # which then calls send_verification_email(email, token).
    captured_token: dict[str, str] = {}

    def _capture(recipients, subject, body_html):
        captured_token["body"] = body_html
        return True

    with patch(
        "app.services.email.verification_email.send_email", side_effect=_capture,
    ):
        resp = await client.post(
            "/auth/request-verify-token", json={"email": user["email"]},
        )
        assert resp.status_code == 202

    # The token is embedded in the verify URL inside the email body;
    # extract it.
    body = captured_token.get("body", "")
    assert "verify-email?token=" in body
    token = body.split("verify-email?token=", 1)[1].split('"', 1)[0]
    assert token

    resp = await client.post("/auth/verify", json={"token": token})
    assert resp.status_code == 200
    assert resp.json()["is_verified"] is True

    # Login now succeeds
    login_resp = await client.post(
        "/auth/jwt/login",
        data={"username": user["email"], "password": user["password"]},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


@pytest.mark.asyncio
async def test_request_verify_token_sends_email(
    client: AsyncClient, user_factory,
) -> None:
    user = await user_factory(verified=False)
    with patch(
        "app.services.email.verification_email.send_email", return_value=True,
    ) as mock_send:
        resp = await client.post(
            "/auth/request-verify-token", json={"email": user["email"]},
        )
        assert resp.status_code == 202
        assert mock_send.call_count == 1
        # First positional arg is the recipients list
        recipients = mock_send.call_args.args[0]
        assert recipients == [user["email"]]


@pytest.mark.asyncio
async def test_register_triggers_verification_email(
    client: AsyncClient,
) -> None:
    with patch(
        "app.services.email.verification_email.send_email", return_value=True,
    ) as mock_send:
        resp = await client.post(
            "/auth/register",
            json={"email": "newbie@example.com", "password": "TestPassword123!"},
        )
        assert resp.status_code == 201
        assert mock_send.call_count == 1
        recipients = mock_send.call_args.args[0]
        assert recipients == ["newbie@example.com"]


@pytest.mark.asyncio
async def test_invalid_verify_token_returns_400(client: AsyncClient) -> None:
    resp = await client.post("/auth/verify", json={"token": "garbage"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "VERIFY_USER_BAD_TOKEN"


@pytest.mark.asyncio
async def test_already_verified_user_can_login(
    client: AsyncClient, user_factory,
) -> None:
    """Sanity check: the default fixture path produces verified users that
    can hit the login endpoint successfully."""
    user = await user_factory()  # verified=True by default
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 200
