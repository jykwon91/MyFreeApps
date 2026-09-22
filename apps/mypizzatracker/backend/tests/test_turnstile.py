"""Tests for Turnstile CAPTCHA enforcement via the shared platform_shared factory.

require_turnstile is built from platform_shared.core.rate_limit.make_require_turnstile
(app/core/rate_limit.py). Mirrors apps/mybookkeeper/backend/tests/test_turnstile.py.

Covers:
- Dev mode (turnstile_secret_key="") -> no CAPTCHA check, succeeds without header
- Missing X-Turnstile-Token header -> 400
- A valid token (mocked) -> passes
- An invalid token (mocked) -> 400 captcha_verification_failed
- Error-code routing: invalid-input-secret -> 503, timeout-or-duplicate -> 400
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Request
from fastapi.datastructures import Headers

from app.core.config import settings
from app.core.rate_limit import require_turnstile


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
    request._client = MagicMock()
    request._client.host = client_host
    return request


class TestRequireTurnstile:
    @pytest.mark.asyncio
    async def test_dev_mode_passes_without_token(self) -> None:
        """When turnstile_secret_key is empty, verification is skipped."""
        with patch.object(settings, "turnstile_secret_key", ""):
            request = _make_request()
            await require_turnstile(request)  # must not raise

    @pytest.mark.asyncio
    async def test_missing_token_raises_400(self) -> None:
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            request = _make_request()  # no token header
            with pytest.raises(HTTPException) as exc_info:
                await require_turnstile(request)
            assert exc_info.value.status_code == 400
            assert exc_info.value.detail == "Captcha token required"

    @pytest.mark.asyncio
    async def test_valid_token_passes(self) -> None:
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=(True, [])),
            ):
                request = _make_request({"x-turnstile-token": "good-token"})
                await require_turnstile(request)  # must not raise

    @pytest.mark.asyncio
    async def test_invalid_token_raises_400(self) -> None:
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=(False, [])),
            ):
                request = _make_request({"x-turnstile-token": "bad-token"})
                with pytest.raises(HTTPException) as exc_info:
                    await require_turnstile(request)
                assert exc_info.value.status_code == 400
                assert exc_info.value.detail == "captcha_verification_failed"

    @pytest.mark.asyncio
    async def test_invalid_input_secret_raises_503(self) -> None:
        """Config bug (invalid-input-secret) surfaces as 503, not a user-facing 400."""
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=(False, ["invalid-input-secret"])),
            ):
                request = _make_request({"x-turnstile-token": "any-token"})
                with pytest.raises(HTTPException) as exc_info:
                    await require_turnstile(request)
                assert exc_info.value.status_code == 503
                assert exc_info.value.detail == "captcha_service_misconfigured"

    @pytest.mark.asyncio
    async def test_timeout_or_duplicate_raises_400_retry(self) -> None:
        """Token reuse / expiry surfaces as 400 with a user-actionable detail."""
        with patch.object(settings, "turnstile_secret_key", "test-secret"):
            with patch(
                "app.core.rate_limit.verify_turnstile_token",
                new=AsyncMock(return_value=(False, ["timeout-or-duplicate"])),
            ):
                request = _make_request({"x-turnstile-token": "spent-token"})
                with pytest.raises(HTTPException) as exc_info:
                    await require_turnstile(request)
                assert exc_info.value.status_code == 400
                assert exc_info.value.detail == "captcha_expired_please_retry"
