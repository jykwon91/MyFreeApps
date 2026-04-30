"""Turnstile CAPTCHA gating on /auth/register and /auth/forgot-password.

In dev/CI ``TURNSTILE_SECRET_KEY`` is empty and the dependency is a no-op.
With a real secret the dependency reads the ``X-Turnstile-Token`` header
and verifies it via Cloudflare's siteverify endpoint (mocked here).
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.config import settings


def _email() -> str:
    return f"ts-{uuid.uuid4().hex[:8]}@example.com"


# ---------------------------------------------------------------------------
# /auth/register
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_succeeds_without_token_when_secret_empty(client: AsyncClient) -> None:
    """Default state: TURNSTILE_SECRET_KEY="" → the gate is a no-op."""
    assert settings.turnstile_secret_key == ""
    resp = await client.post(
        "/auth/register",
        json={"email": _email(), "password": "long-enough-password-1234"},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_register_succeeds_with_valid_turnstile_token(
    client: AsyncClient, monkeypatch,
) -> None:
    """When the secret is set, a valid token (verifier returns True) lets the request through."""
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    with patch(
        "app.core.rate_limit.verify_turnstile_token",
        new=AsyncMock(return_value=True),
    ):
        resp = await client.post(
            "/auth/register",
            json={"email": _email(), "password": "long-enough-password-1234"},
            headers={"X-Turnstile-Token": "valid-token"},
        )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_register_rejected_with_invalid_turnstile_token(
    client: AsyncClient, monkeypatch,
) -> None:
    """When the verifier returns False, the request is rejected with 400."""
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    with patch(
        "app.core.rate_limit.verify_turnstile_token",
        new=AsyncMock(return_value=False),
    ):
        resp = await client.post(
            "/auth/register",
            json={"email": _email(), "password": "long-enough-password-1234"},
            headers={"X-Turnstile-Token": "bad-token"},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Captcha verification failed"


@pytest.mark.asyncio
async def test_register_rejected_when_token_missing(
    client: AsyncClient, monkeypatch,
) -> None:
    """When the secret is set but no header is sent, 400 with a clear message."""
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    resp = await client.post(
        "/auth/register",
        json={"email": _email(), "password": "long-enough-password-1234"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Captcha token required"


# ---------------------------------------------------------------------------
# /auth/forgot-password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_password_succeeds_without_token_when_secret_empty(
    client: AsyncClient,
) -> None:
    """Default state: gate is a no-op."""
    assert settings.turnstile_secret_key == ""
    resp = await client.post(
        "/auth/forgot-password",
        json={"email": "anyone@example.com"},
    )
    # fastapi-users always returns 202 for forgot-password to avoid email enumeration.
    assert resp.status_code == 202, resp.text


@pytest.mark.asyncio
async def test_forgot_password_rejected_when_token_missing(
    client: AsyncClient, monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    resp = await client.post(
        "/auth/forgot-password",
        json={"email": "anyone@example.com"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Captcha token required"


@pytest.mark.asyncio
async def test_forgot_password_succeeds_with_valid_token(
    client: AsyncClient, monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    with patch(
        "app.core.rate_limit.verify_turnstile_token",
        new=AsyncMock(return_value=True),
    ):
        resp = await client.post(
            "/auth/forgot-password",
            json={"email": "anyone@example.com"},
            headers={"X-Turnstile-Token": "valid-token"},
        )
    assert resp.status_code == 202, resp.text


# ---------------------------------------------------------------------------
# Reset-password is intentionally NOT gated (matches MBK policy).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_password_does_not_require_turnstile(
    client: AsyncClient, monkeypatch,
) -> None:
    """The email-link token is the security control on reset-password — no CAPTCHA."""
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    # No X-Turnstile-Token header. The token here is deliberately invalid, so we
    # expect a 400 from fastapi-users for a bad reset token — NOT a 400 from
    # the captcha gate.
    resp = await client.post(
        "/auth/reset-password",
        json={"token": "obviously-not-a-real-reset-token", "password": "new-strong-password-1234"},
    )
    assert resp.status_code == 400
    assert resp.json().get("detail") != "Captcha token required"
    assert resp.json().get("detail") != "Captcha verification failed"
