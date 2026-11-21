"""A government feed being down must cost one slow attempt, not one per page view.

Covers the three clients (PMMS, Power to Choose, TDI) and the per-ZIP fan-out in
the utility offer service: failures are remembered briefly, every fetch has a
total deadline, and distinct ZIPs are fetched once and concurrently.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging

import httpx
import pytest

from app.services import feed_failure_cache
from app.services.feed_failure_cache import FeedFailureCache
from app.services.insurance import tdi_rate_filings_client as tdi
from app.services.mortgage import pmms_client as pmms
from app.services.properties import power_to_choose_client as ptc
from app.services.properties import utility_offer_service

TODAY = _dt.date(2026, 8, 20)


@pytest.fixture(autouse=True)
def _reset_feed_state():
    def _reset() -> None:
        pmms._cache = None
        pmms._failures.reset()
        tdi._cache = None
        tdi._failures.reset()
        ptc._cache.clear()
        ptc._failures.reset()

    _reset()
    yield
    _reset()


@pytest.fixture
def _no_backoff(monkeypatch):
    async def _sleep(seconds):
        return None

    monkeypatch.setattr(pmms.asyncio, "sleep", _sleep)
    monkeypatch.setattr(tdi.asyncio, "sleep", _sleep)


class TestFeedFailureCache:
    def test_remembers_a_failure_within_the_ttl(self) -> None:
        cache = FeedFailureCache()
        cache.record("k", "down")
        assert cache.recent_failure("k") == "down"
        assert cache.recent_failure("other") is None

    def test_forgets_a_failure_after_the_ttl(self, monkeypatch) -> None:
        cache = FeedFailureCache()
        cache.record("k", "down")
        monkeypatch.setattr(feed_failure_cache, "FEED_FAILURE_CACHE_TTL_SECONDS", 0.0)
        assert cache.recent_failure("k") is None


class TestPmms:
    @pytest.mark.asyncio
    async def test_an_outage_is_fetched_once_then_fails_fast(
        self, monkeypatch, _no_backoff,
    ) -> None:
        calls: list[int] = []

        async def _get(self, url, **kwargs):
            calls.append(1)
            raise httpx.ConnectError("no route")

        monkeypatch.setattr(pmms.httpx.AsyncClient, "get", _get)
        with pytest.raises(pmms.MortgageRateFeedUnavailableError):
            await pmms.fetch_rate_survey(today=TODAY)
        attempts_for_first_visit = len(calls)
        with pytest.raises(pmms.MortgageRateFeedUnavailableError):
            await pmms.fetch_rate_survey(today=TODAY)
        assert len(calls) == attempts_for_first_visit

    @pytest.mark.asyncio
    async def test_a_hung_feed_is_cut_off_by_the_total_deadline(
        self, monkeypatch,
    ) -> None:
        async def _get(self, url, **kwargs):
            await asyncio.sleep(30)

        monkeypatch.setattr(pmms.httpx.AsyncClient, "get", _get)
        monkeypatch.setattr(pmms, "FEED_TOTAL_DEADLINE_SECONDS", 0.05)
        with pytest.raises(pmms.MortgageRateFeedUnavailableError, match="timed out"):
            await pmms.fetch_rate_survey(today=TODAY)

    @pytest.mark.asyncio
    async def test_a_recovered_feed_is_picked_up_after_the_ttl(
        self, monkeypatch,
    ) -> None:
        async def _down(self, url, **kwargs):
            return httpx.Response(503, text="down", request=httpx.Request("GET", url))

        monkeypatch.setattr(pmms.httpx.AsyncClient, "get", _down)
        with pytest.raises(pmms.MortgageRateFeedUnavailableError):
            await pmms.fetch_rate_survey(today=TODAY)

        body = "DATE,MORTGAGE30US,MORTGAGE15US\n2026-08-13,6.67,5.96\n"

        async def _up(self, url, **kwargs):
            return httpx.Response(200, text=body, request=httpx.Request("GET", url))

        monkeypatch.setattr(pmms.httpx.AsyncClient, "get", _up)
        monkeypatch.setattr(feed_failure_cache, "FEED_FAILURE_CACHE_TTL_SECONDS", 0.0)
        survey = await pmms.fetch_rate_survey(today=TODAY)
        assert survey.thirty_year.rate_pct is not None


class TestTdi:
    @pytest.mark.asyncio
    async def test_an_outage_is_fetched_once_then_fails_fast(self, monkeypatch) -> None:
        calls: list[int] = []

        async def _get(self, url, **kwargs):
            calls.append(1)
            return httpx.Response(503, text="down", request=httpx.Request("GET", url))

        monkeypatch.setattr(tdi.httpx.AsyncClient, "get", _get)
        for _ in range(3):
            with pytest.raises(tdi.RateFilingFeedUnavailableError):
                await tdi.fetch_dwelling_filings()
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_no_retry_starts_that_could_not_finish_inside_the_budget(
        self, monkeypatch, _no_backoff,
    ) -> None:
        # Budget 20s, per-attempt timeout 15s: after a failed attempt a retry
        # would run past the deadline, so it must not start. The old check only
        # compared the start time of the retry against the deadline.
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            raise httpx.ConnectTimeout("slow")

        monkeypatch.setattr(tdi.httpx.AsyncClient, "get", _get)
        monkeypatch.setattr(tdi, "FETCH_BUDGET_SECONDS", 10.0)
        monkeypatch.setattr(tdi, "FETCH_TIMEOUT_SECONDS", 15.0)
        with pytest.raises(tdi.RateFilingFeedUnavailableError):
            await tdi.fetch_dwelling_filings()
        assert len(attempts) == 1


class TestPowerToChoose:
    @pytest.mark.asyncio
    async def test_an_outage_is_fetched_once_per_zip_then_fails_fast(
        self, monkeypatch,
    ) -> None:
        calls: list[str] = []

        async def _get(self, url, **kwargs):
            calls.append(kwargs["params"]["zip_code"])
            return httpx.Response(503, text="down", request=httpx.Request("GET", url))

        monkeypatch.setattr(ptc.httpx.AsyncClient, "get", _get)
        for _ in range(3):
            with pytest.raises(ptc.OfferFeedUnavailableError):
                await ptc.fetch_offers("77001")
        assert calls == ["77001"]

        with pytest.raises(ptc.OfferFeedUnavailableError):
            await ptc.fetch_offers("75001")
        assert calls == ["77001", "75001"]

    @pytest.mark.asyncio
    async def test_a_hung_feed_is_cut_off_by_the_total_deadline(
        self, monkeypatch, caplog,
    ) -> None:
        async def _get(self, url, **kwargs):
            await asyncio.sleep(30)

        monkeypatch.setattr(ptc.httpx.AsyncClient, "get", _get)
        monkeypatch.setattr(ptc, "FEED_TOTAL_DEADLINE_SECONDS", 0.05)
        with caplog.at_level(logging.WARNING):
            with pytest.raises(ptc.OfferFeedUnavailableError, match="timed out"):
                await ptc.fetch_offers("77001")
        assert "77001" not in caplog.text


class TestOfferFanOut:
    @pytest.mark.asyncio
    async def test_each_distinct_zip_is_fetched_once_and_concurrently(
        self, monkeypatch,
    ) -> None:
        in_flight = 0
        peak = 0
        seen: list[str] = []

        async def _fetch(zip_code: str):
            nonlocal in_flight, peak
            seen.append(zip_code)
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            if zip_code == "75001":
                raise utility_offer_service.OfferFeedUnavailableError("down")
            return []

        monkeypatch.setattr(utility_offer_service, "fetch_offers", _fetch)
        result = await utility_offer_service._fetch_offers_by_zip({"77001", "75001", "78701"})

        assert sorted(seen) == ["75001", "77001", "78701"]
        assert peak == 3
        assert result == {"77001": [], "75001": None, "78701": []}
