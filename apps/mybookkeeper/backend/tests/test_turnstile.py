"""Tests for Turnstile CAPTCHA enforcement on forgot-password.

Covers:
- POST /auth/forgot-password without X-Turnstile-Token header → 400
- POST /auth/forgot-password with a valid token (mocked) → 202
- POST /auth/forgot-password with an invalid token (mocked) → 400
- Dev mode (turnstile_secret_key="") → no CAPTCHA check, succeeds without header
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, Request
from fastapi.datastructures import Headers

from app.core.rate_limit import require_turnstile
from app.core.config import settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(headers: dict[str, str] | None = None, client_host: str = "1.2.3.4") -> Request:
    """Build a minimal mock Request with the given headers."""
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/forgot-password",
        "headers": Headers(headers or {}).raw,
        "query_string": b"",
    }
    request = Request(scope)
    # Patch client so _get_client_ip can read it
    from unittest.mock import MagicMock
    request._client = MagicMock()
    request._client.host = client_host
    return request


# ---------------------------------------------------------------------------
# require_turnstile dependency — unit tests
# ---------------------------------------------------------------------------

class TestRequireTurnstile:
    @pytest.mark.anyio
    async def test_dev_mode_passes_without_token(self) -> None:
        """When turnstile_secret_key is empty, verification is skipped."""
        with patch.object(settings, "turnstile_secret_key", ""):
            request = _make_request()
            await require_turnstile(request)  # must not raise

    @pytest.mark.anyio
    async def test_missing_token_raises_400(self) -> None:
        """Missing X-Turnstile-Token header raises 400 when key is configured."""
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            request = _make_request()  # no token header
            with pytest.raises(HTTPException) as exc_info:
                await require_turnstile(request)
            assert exc_info.value.status_code == 400
            assert exc_info.value.detail == "Captcha token required"

    @pytest.mark.anyio
    async def test_invalid_token_raises_400(self) -> None:
        """A token that fails Cloudflare verification raises 400."""
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=False),
            ):
                request = _make_request({"x-turnstile-token": "bad-token"})
                with pytest.raises(HTTPException) as exc_info:
                    await require_turnstile(request)
                assert exc_info.value.status_code == 400
                assert exc_info.value.detail == "Captcha verification failed"

    @pytest.mark.anyio
    async def test_valid_token_passes(self) -> None:
        """A token that passes Cloudflare verification does not raise."""
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=True),
            ):
                request = _make_request({"x-turnstile-token": "good-token"})
                await require_turnstile(request)  # must not raise

    @pytest.mark.anyio
    async def test_valid_token_passes_client_ip_forwarded(self) -> None:
        """X-Forwarded-For header is used as the remote IP."""
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=True),
            ) as mock_verify:
                request = _make_request({
                    "x-turnstile-token": "good-token",
                    "x-forwarded-for": "9.9.9.9, 10.0.0.1",
                })
                await require_turnstile(request)
                mock_verify.assert_awaited_once_with("good-token", "9.9.9.9")


# ---------------------------------------------------------------------------
# check_register_rate_limit still calls require_turnstile (DRY refactor check)
# ---------------------------------------------------------------------------

class TestRegisterRateLimitStillVerifies:
    @pytest.mark.anyio
    async def test_register_rate_limit_rejects_missing_token(self) -> None:
        """check_register_rate_limit still enforces CAPTCHA after refactor."""
        from app.core.rate_limit import check_register_rate_limit, register_limiter

        # Reset limiter state so we don't hit the rate cap
        register_limiter._buckets.clear()

        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            request = _make_request()
            with pytest.raises(HTTPException) as exc_info:
                await check_register_rate_limit(request)
            assert exc_info.value.status_code == 400
            assert exc_info.value.detail == "Captcha token required"

    @pytest.mark.anyio
    async def test_register_rate_limit_passes_with_valid_token(self) -> None:
        """check_register_rate_limit passes when token verifies."""
        from app.core.rate_limit import check_register_rate_limit, register_limiter

        register_limiter._buckets.clear()

        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=True),
            ):
                request = _make_request({"x-turnstile-token": "good-token"})
                await check_register_rate_limit(request)  # must not raise
