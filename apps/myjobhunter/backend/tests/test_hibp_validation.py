"""HIBP password breach check at registration.

Mirrors MBK's coverage: rejection on a known-pwned password, acceptance on a
clean one, bypass when ``HIBP_ENABLED=false``, fail-open on HIBP outage.

The HIBP service is patched directly in ``app.core.auth`` (where it's imported)
so no real network calls are made. The autouse fixture in ``conftest.py``
disables HIBP by default — every test in this module flips it back on first.
"""
import logging
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.config import settings
from platform_shared.services.hibp_service import HIBPCheckError


def _email() -> str:
    return f"hibp-{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(autouse=True)
def _enable_hibp(monkeypatch: pytest.MonkeyPatch) -> None:
    """Re-enable HIBP for every test in this file (overrides conftest autouse)."""
    monkeypatch.setattr(settings, "hibp_enabled", True)


@pytest.mark.asyncio
async def test_pwned_password_rejected_with_breach_message(client: AsyncClient) -> None:
    with patch("app.core.auth.is_password_pwned", new=AsyncMock(return_value=True)):
        resp = await client.post(
            "/auth/register",
            json={"email": _email(), "password": "correct horse battery staple"},
        )
    assert resp.status_code == 400
    body = resp.json()
    # fastapi-users wraps validate_password failures as
    # {"detail": {"code": "REGISTER_INVALID_PASSWORD", "reason": "..."}}
    detail = body.get("detail")
    assert isinstance(detail, dict), body
    assert "data breach" in detail.get("reason", "")
    assert "anonymously" in detail.get("reason", "")


@pytest.mark.asyncio
async def test_clean_password_passes_hibp_check(client: AsyncClient) -> None:
    """A password not in the HIBP corpus should not be rejected on HIBP grounds."""
    email = _email()
    with patch("app.core.auth.is_password_pwned", new=AsyncMock(return_value=False)):
        resp = await client.post(
            "/auth/register",
            json={"email": email, "password": "this-is-a-strong-unique-pass-9173"},
        )
    # Either 201 (accepted) or some other validation failure that is NOT the HIBP message.
    if resp.status_code != 201:
        body = resp.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            assert "data breach" not in detail.get("reason", ""), body
        else:
            # short-password / email-taken errors are fine for this assertion
            assert resp.status_code in (400, 422), body


@pytest.mark.asyncio
async def test_hibp_disabled_skips_check(client: AsyncClient, monkeypatch) -> None:
    """When HIBP_ENABLED=false the network check is skipped entirely."""
    monkeypatch.setattr(settings, "hibp_enabled", False)
    mock_check = AsyncMock(return_value=True)
    with patch("app.core.auth.is_password_pwned", new=mock_check):
        resp = await client.post(
            "/auth/register",
            json={"email": _email(), "password": "any-password-1234"},
        )
    # Should pass HIBP gate (mock would have rejected if invoked).
    assert resp.status_code == 201, resp.text
    mock_check.assert_not_called()


@pytest.mark.asyncio
async def test_hibp_outage_fails_open(client: AsyncClient, caplog) -> None:
    """If HIBP raises HIBPCheckError, registration succeeds with a WARNING log."""
    raise_outage = AsyncMock(side_effect=HIBPCheckError("simulated outage"))
    with caplog.at_level(logging.WARNING, logger="app.core.auth"):
        with patch("app.core.auth.is_password_pwned", new=raise_outage):
            resp = await client.post(
                "/auth/register",
                json={"email": _email(), "password": "another-strong-password-7777"},
            )
    assert resp.status_code == 201, resp.text
    assert any(
        "HIBP check failed" in record.getMessage()
        for record in caplog.records
    ), [r.getMessage() for r in caplog.records]


@pytest.mark.asyncio
async def test_short_password_rejected_before_hibp(client: AsyncClient) -> None:
    """Length check must fire first so HIBP isn't called for trivially short passwords."""
    mock_check = AsyncMock(return_value=False)
    with patch("app.core.auth.is_password_pwned", new=mock_check):
        resp = await client.post(
            "/auth/register",
            json={"email": _email(), "password": "short"},
        )
    assert resp.status_code == 400
    mock_check.assert_not_called()
