"""Unit tests for platform_shared.services.hibp_service.

Covers the k-anonymity range API contract (only first 5 SHA-1 hex chars are
sent), suffix matching, threshold logic, and error wrapping. The real HIBP
endpoint is mocked via ``httpx.MockTransport`` so the test suite stays offline.
"""
import hashlib

import httpx
import pytest

from platform_shared.services import hibp_service
from platform_shared.services.hibp_service import (
    HIBP_API_URL,
    HIBP_USER_AGENT,
    HIBPCheckError,
    is_password_pwned,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha1(password: str) -> tuple[str, str]:
    """Return (prefix5, suffix35) for a password — mirrors the API contract."""
    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()  # noqa: S324
    return digest[:5], digest[5:]


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, handler) -> dict:
    """Replace ``httpx.AsyncClient`` with one that uses a MockTransport.

    Returns a dict that the handler closure can write to so individual
    tests can assert on the captured request.
    """
    captured: dict = {}

    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(hibp_service.httpx, "AsyncClient", factory)
    return captured


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_user_agent_is_platform_branded(self) -> None:
        """User-Agent must identify the platform, not a single app — HIBP requires it."""
        assert HIBP_USER_AGENT == "MyFreeApps-PasswordCheck/1.0"

    def test_api_url(self) -> None:
        assert HIBP_API_URL == "https://api.pwnedpasswords.com/range/"


# ---------------------------------------------------------------------------
# Range API contract
# ---------------------------------------------------------------------------

class TestKAnonymityContract:
    @pytest.mark.anyio
    async def test_only_prefix_is_sent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The plaintext password must never appear in the outgoing request."""
        password = "P@ssw0rd1234"
        prefix, _ = _sha1(password)

        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, text="")

        _install_mock_transport(monkeypatch, handler)

        await is_password_pwned(password)

        assert captured["url"].endswith(f"/range/{prefix}")
        assert password not in captured["url"]
        assert captured["headers"]["user-agent"] == HIBP_USER_AGENT
        assert captured["headers"]["add-padding"] == "true"


# ---------------------------------------------------------------------------
# Result interpretation
# ---------------------------------------------------------------------------

class TestResultInterpretation:
    @pytest.mark.anyio
    async def test_pwned_password_returns_true(self, monkeypatch: pytest.MonkeyPatch) -> None:
        password = "P@ssw0rd1234"
        _, suffix = _sha1(password)

        def handler(_: httpx.Request) -> httpx.Response:
            body = f"{suffix}:42\nDEADBEEF1234567890ABCDEF1234567890ABCDE:1\n"
            return httpx.Response(200, text=body)

        _install_mock_transport(monkeypatch, handler)
        assert await is_password_pwned(password) is True

    @pytest.mark.anyio
    async def test_unseen_password_returns_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        password = "this-is-a-very-unique-string-99"

        def handler(_: httpx.Request) -> httpx.Response:
            body = "DEADBEEF1234567890ABCDEF1234567890ABCDE:1\n"
            return httpx.Response(200, text=body)

        _install_mock_transport(monkeypatch, handler)
        assert await is_password_pwned(password) is False

    @pytest.mark.anyio
    async def test_threshold_filters_low_count_matches(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A match below the threshold must be reported as not-pwned."""
        password = "ExampleX99Z!!"
        _, suffix = _sha1(password)

        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text=f"{suffix}:3\n")

        _install_mock_transport(monkeypatch, handler)
        assert await is_password_pwned(password, threshold=10) is False
        # And inversely, a low threshold catches the same record.
        assert await is_password_pwned(password, threshold=1) is True

    @pytest.mark.anyio
    async def test_garbage_count_lines_skipped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A non-integer count line must be skipped, not crash the lookup."""
        password = "ExampleX99Z!!"
        _, suffix = _sha1(password)

        def handler(_: httpx.Request) -> httpx.Response:
            body = f"{suffix}:not-a-number\nDEADBEEF1234567890ABCDEF1234567890ABCDE:1\n"
            return httpx.Response(200, text=body)

        _install_mock_transport(monkeypatch, handler)
        # The matching line is unparseable, so nothing else matches → False.
        assert await is_password_pwned(password) is False


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    @pytest.mark.anyio
    async def test_http_500_raises_check_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="server error")

        _install_mock_transport(monkeypatch, handler)
        with pytest.raises(HIBPCheckError):
            await is_password_pwned("anything-99-99-99")

    @pytest.mark.anyio
    async def test_network_failure_raises_check_error(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("network down", request=request)

        _install_mock_transport(monkeypatch, handler)
        with pytest.raises(HIBPCheckError) as exc_info:
            await is_password_pwned("anything-99-99-99")
        assert "unreachable" in str(exc_info.value)
