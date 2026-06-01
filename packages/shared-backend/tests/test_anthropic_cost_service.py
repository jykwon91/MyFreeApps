"""Unit tests for platform_shared.services.transparency.anthropic_cost_service.

Uses httpx.MockTransport (same pattern as test_turnstile_service) to stub the
Admin Cost Report API. Confirms: empty key short-circuits, decimal-cent
amounts sum correctly, pagination follows next_page, the right headers/params
go out, and non-2xx / network failures raise AnthropicCostError with the
provider error logged.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
import pytest

from platform_shared.services.transparency import anthropic_cost_service
from platform_shared.services.transparency.anthropic_cost_service import (
    AnthropicCostError,
    fetch_cost_cents,
)

_MONTH_START = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    """Inject a MockTransport into every httpx.AsyncClient the module builds."""
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(anthropic_cost_service.httpx, "AsyncClient", factory)


def _bucket(*amounts: str) -> dict:
    return {"results": [{"amount": a, "currency": "USD"} for a in amounts]}


class TestNoKey:
    @pytest.mark.anyio
    async def test_empty_key_returns_zero_without_network(self, monkeypatch: pytest.MonkeyPatch) -> None:
        hit = {"n": 0}

        def handler(_: httpx.Request) -> httpx.Response:
            hit["n"] += 1
            return httpx.Response(500)

        _install_mock_transport(monkeypatch, handler)
        result = await fetch_cost_cents(api_key="", starting_at=_MONTH_START)
        assert result == 0
        assert hit["n"] == 0


class TestSummation:
    @pytest.mark.anyio
    async def test_sums_amounts_as_cents(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"data": [_bucket("12345.00"), _bucket("67.00")], "has_more": False},
            )

        _install_mock_transport(monkeypatch, handler)
        # amounts are already in cents → 12345 + 67 = 12412
        assert await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START) == 12412

    @pytest.mark.anyio
    async def test_multiple_results_in_one_bucket_sum(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, json={"data": [_bucket("100.00", "50.00", "25.00")], "has_more": False},
            )

        _install_mock_transport(monkeypatch, handler)
        assert await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START) == 175

    @pytest.mark.anyio
    async def test_fractional_cents_round_half_up(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"data": [_bucket("100.50")], "has_more": False})

        _install_mock_transport(monkeypatch, handler)
        assert await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START) == 101

    @pytest.mark.anyio
    async def test_empty_data_is_zero(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"data": [], "has_more": False})

        _install_mock_transport(monkeypatch, handler)
        assert await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START) == 0


class TestRequestShape:
    @pytest.mark.anyio
    async def test_headers_and_params(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["x-api-key"] = request.headers.get("x-api-key")
            captured["anthropic-version"] = request.headers.get("anthropic-version")
            captured["starting_at"] = request.url.params.get("starting_at")
            captured["bucket_width"] = request.url.params.get("bucket_width")
            captured["ending_at"] = request.url.params.get("ending_at")
            return httpx.Response(200, json={"data": [], "has_more": False})

        _install_mock_transport(monkeypatch, handler)
        await fetch_cost_cents(api_key="sk-ant-admin-xyz", starting_at=_MONTH_START, ending_at=_NOW)
        assert captured["x-api-key"] == "sk-ant-admin-xyz"
        assert captured["anthropic-version"] == "2023-06-01"
        assert captured["starting_at"] == "2026-06-01T00:00:00Z"
        assert captured["bucket_width"] == "1d"
        assert captured["ending_at"] == "2026-06-15T12:00:00Z"


class TestPagination:
    @pytest.mark.anyio
    async def test_follows_next_page(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen_pages: list[str | None] = []

        def handler(request: httpx.Request) -> httpx.Response:
            page = request.url.params.get("page")
            seen_pages.append(page)
            if page is None:
                return httpx.Response(
                    200,
                    json={"data": [_bucket("100.00")], "has_more": True, "next_page": "PAGE2"},
                )
            return httpx.Response(
                200, json={"data": [_bucket("200.00")], "has_more": False},
            )

        _install_mock_transport(monkeypatch, handler)
        total = await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START)
        assert total == 300
        assert seen_pages == [None, "PAGE2"]

    @pytest.mark.anyio
    async def test_stops_when_next_page_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls = {"n": 0}

        def handler(_: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            # has_more True but no next_page → must stop, not loop forever.
            return httpx.Response(200, json={"data": [_bucket("10.00")], "has_more": True})

        _install_mock_transport(monkeypatch, handler)
        total = await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START)
        assert total == 10
        assert calls["n"] == 1


class TestErrors:
    @pytest.mark.anyio
    async def test_non_200_raises_and_logs_error_type(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
    ) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                401,
                json={"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}},
            )

        _install_mock_transport(monkeypatch, handler)
        with caplog.at_level(logging.WARNING, logger="platform_shared.services.transparency.anthropic_cost_service"):
            with pytest.raises(AnthropicCostError):
                await fetch_cost_cents(api_key="sk-ant-admin-bad", starting_at=_MONTH_START)
        assert any("authentication_error" in r.message for r in caplog.records)
        assert any(r.levelno == logging.WARNING for r in caplog.records)

    @pytest.mark.anyio
    async def test_network_error_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        _install_mock_transport(monkeypatch, handler)
        with pytest.raises(AnthropicCostError):
            await fetch_cost_cents(api_key="sk-ant-admin-x", starting_at=_MONTH_START)
