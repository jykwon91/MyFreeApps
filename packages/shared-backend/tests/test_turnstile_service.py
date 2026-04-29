"""Unit tests for platform_shared.services.turnstile_service.

The verifier is decoupled from any app config — apps pass ``secret_key`` in.
An empty/None key is the documented dev-mode no-op (returns True without
contacting Cloudflare).
"""
import httpx
import pytest

from platform_shared.services import turnstile_service
from platform_shared.services.turnstile_service import (
    TURNSTILE_VERIFY_URL,
    verify_turnstile_token,
)


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    """Inject a MockTransport into every ``httpx.AsyncClient`` the module spins up."""
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(turnstile_service.httpx, "AsyncClient", factory)


class TestNoOpDevMode:
    @pytest.mark.anyio
    async def test_empty_secret_returns_true_without_network(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """When secret_key is empty, the function must short-circuit to True."""
        called = {"hit": False}

        def handler(_: httpx.Request) -> httpx.Response:
            called["hit"] = True
            return httpx.Response(500)

        _install_mock_transport(monkeypatch, handler)

        assert await verify_turnstile_token("any-token", secret_key="") is True
        assert called["hit"] is False, "Empty secret must not contact Cloudflare"

    @pytest.mark.anyio
    async def test_none_secret_returns_true_without_network(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        called = {"hit": False}

        def handler(_: httpx.Request) -> httpx.Response:
            called["hit"] = True
            return httpx.Response(500)

        _install_mock_transport(monkeypatch, handler)

        assert await verify_turnstile_token("any-token", secret_key=None) is True
        assert called["hit"] is False


class TestVerification:
    @pytest.mark.anyio
    async def test_success_response(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["body"] = request.content.decode()
            return httpx.Response(200, json={"success": True})

        _install_mock_transport(monkeypatch, handler)
        ok = await verify_turnstile_token(
            "abc123", remote_ip="9.9.9.9", secret_key="real-secret",
        )
        assert ok is True
        assert captured["url"] == TURNSTILE_VERIFY_URL
        # Body is form-encoded — confirm secret + token + remote IP all flow through.
        assert "secret=real-secret" in captured["body"]
        assert "response=abc123" in captured["body"]
        assert "remoteip=9.9.9.9" in captured["body"]

    @pytest.mark.anyio
    async def test_failure_response(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"success": False, "error-codes": ["invalid-input-response"]},
            )

        _install_mock_transport(monkeypatch, handler)
        assert await verify_turnstile_token("bad", secret_key="real-secret") is False

    @pytest.mark.anyio
    async def test_remote_ip_optional(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When remote_ip is None, the body must omit the remoteip field."""
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = request.content.decode()
            return httpx.Response(200, json={"success": True})

        _install_mock_transport(monkeypatch, handler)
        await verify_turnstile_token("abc", secret_key="real-secret")
        assert "remoteip" not in captured["body"]

    @pytest.mark.anyio
    async def test_response_without_success_field_returns_false(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A malformed Cloudflare response must default to False (fail-closed)."""

        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"unexpected": "shape"})

        _install_mock_transport(monkeypatch, handler)
        assert await verify_turnstile_token("abc", secret_key="real-secret") is False
