"""Tests for reading the TDI rate-filings feed.

The row fixtures are copied from live responses, quirks included: the percent
column is a space-padded display string rather than a number, timestamps carry
a time part that is always midnight, and roughly half the dwelling rows have no
renewal effective date at all.

The disposition rules are the ones worth pinning. A filing is only in force if
it closed as Reviewed; Withdrawn and Rejected closed without ever applying, and
reporting one as an upcoming increase would tell an operator their premium is
rising when it never will.
"""
from __future__ import annotations

import datetime as _dt

import httpx
import pytest

from app.core.tdi_rate_filings_constants import (
    MAX_FETCH_ATTEMPTS,
    RETRY_INITIAL_DELAY_SECONDS,
)
from app.services.insurance import tdi_rate_filings_client as client
from app.services.insurance.tdi_rate_filings_client import (
    RateFilingFeedUnavailableError,
    _parse_date,
    _parse_percent,
    _to_filing,
    fetch_dwelling_filings,
)

_ROW = {
    "serff_id": "SFPT-134523456",
    "company_name": "SAFEPOINT INSURANCE COMPANY",
    "product_name": "TX DWO",
    "percent_change": "  11.1%",
    "received_date": "2026-05-28T00:00:00.000",
    "effective_date_new_business": "2026-09-01T00:00:00.000",
    "effective_date_renewal": "2026-09-01T00:00:00.000",
    "state_type_of_insurance": "Property",
    "state_subtype_of_insurance": "Dwelling",
    "status": "Closed",
    "closed_type": "Reviewed",
}


@pytest.fixture(autouse=True)
def _clear_cache():
    client._cache = None
    yield
    client._cache = None


@pytest.fixture
def _no_backoff(monkeypatch):
    """Run the retry loop without waiting out its real backoff."""
    slept: list[float] = []

    async def _sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr(client.asyncio, "sleep", _sleep)
    return slept


class TestParsing:
    def test_reads_the_padded_percent_string(self):
        assert _parse_percent("  11.1%") == 11.1

    def test_reads_a_flat_filing_as_zero(self):
        assert _parse_percent("   0.0%") == 0.0

    def test_reads_a_decrease(self):
        assert _parse_percent(" -4.2%") == -4.2

    def test_an_unstated_change_is_none_not_zero(self):
        # 296 of the 704 dwelling rows state no change. Reading those as 0.0%
        # would claim the carrier held rates flat, which is a different fact.
        assert _parse_percent("") is None
        assert _parse_percent(None) is None

    def test_reads_the_date_out_of_a_socrata_timestamp(self):
        assert _parse_date("2026-09-01T00:00:00.000") == _dt.date(2026, 9, 1)

    def test_a_blank_date_is_none(self):
        assert _parse_date("") is None
        assert _parse_date(None) is None

    def test_an_unparseable_date_is_none(self):
        assert _parse_date("not a date") is None


class TestRowMapping:
    def test_maps_a_reviewed_filing_as_in_force(self):
        filing = _to_filing(_ROW)
        assert filing is not None
        assert filing.company_name == "SAFEPOINT INSURANCE COMPANY"
        assert filing.product_name == "TX DWO"
        assert filing.percent_change == 11.1
        assert filing.filed_date == _dt.date(2026, 5, 28)
        assert filing.effective_date_renewal == _dt.date(2026, 9, 1)
        assert filing.is_in_force is True
        assert filing.is_pending is False

    @pytest.mark.parametrize("closed_type", ["Withdrawn", "Rejected"])
    def test_an_abandoned_filing_is_not_in_force(self, closed_type):
        filing = _to_filing({**_ROW, "closed_type": closed_type})
        assert filing is not None
        assert filing.is_in_force is False
        assert filing.is_pending is False

    def test_a_pending_filing_is_neither_in_force_nor_dropped(self):
        # Kept, because a proposed increase is exactly the signal that makes an
        # operator shop early — but flagged so it never reads as decided.
        filing = _to_filing({**_ROW, "status": "Pending", "closed_type": ""})
        assert filing is not None
        assert filing.is_in_force is False
        assert filing.is_pending is True

    def test_a_row_with_no_renewal_date_still_maps(self):
        filing = _to_filing({**_ROW, "effective_date_renewal": ""})
        assert filing is not None
        assert filing.effective_date_renewal is None

    def test_a_row_with_no_company_is_unusable(self):
        assert _to_filing({**_ROW, "company_name": ""}) is None

    def test_a_row_with_no_serff_id_is_unusable(self):
        assert _to_filing({**_ROW, "serff_id": ""}) is None


class TestFetch:
    @pytest.mark.asyncio
    async def test_returns_mapped_filings(self, monkeypatch):
        monkeypatch.setattr(
            client.httpx.AsyncClient,
            "get",
            _stub_get(httpx.Response(200, json=[_ROW])),
        )
        filings = await fetch_dwelling_filings()
        assert [f.company_name for f in filings] == ["SAFEPOINT INSURANCE COMPANY"]

    @pytest.mark.asyncio
    async def test_caches_between_calls(self, monkeypatch):
        calls: list[int] = []

        async def _get(self, url, **kwargs):
            calls.append(1)
            return httpx.Response(200, json=[_ROW], request=httpx.Request("GET", url))

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        await fetch_dwelling_filings()
        await fetch_dwelling_filings()
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_an_http_error_raises_rather_than_returning_empty(self, monkeypatch):
        # An empty list would render as "no increases filed", which is the one
        # thing an outage must never look like.
        monkeypatch.setattr(
            client.httpx.AsyncClient, "get", _stub_get(httpx.Response(503, text="down")),
        )
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()

    @pytest.mark.asyncio
    async def test_a_network_failure_raises(self, monkeypatch, _no_backoff):
        async def _get(self, url, **kwargs):
            raise httpx.ConnectError("no route to host")

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()

    @pytest.mark.asyncio
    async def test_an_unexpected_shape_raises(self, monkeypatch):
        monkeypatch.setattr(
            client.httpx.AsyncClient,
            "get",
            _stub_get(httpx.Response(200, json={"error": "bad query"})),
        )
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()


class TestRetry:
    """What a single hiccup is allowed to cost.

    Production lost the whole section on 2026-08-17 to one unresolved name —
    ``[Errno -2] Name or service not known`` — on a host that had read the feed
    successfully hours earlier and logged no other resolution failure in two
    weeks. These pin the retry to the class of failure a second attempt can
    actually fix, and off the class it cannot.
    """

    @pytest.mark.asyncio
    async def test_a_dns_miss_is_retried_and_succeeds(self, monkeypatch, _no_backoff):
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                raise httpx.ConnectError("[Errno -2] Name or service not known")
            return httpx.Response(200, json=[_ROW], request=httpx.Request("GET", url))

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        filings = await fetch_dwelling_filings()
        assert len(attempts) == 2
        assert [f.company_name for f in filings] == ["SAFEPOINT INSURANCE COMPANY"]

    @pytest.mark.asyncio
    async def test_a_read_timeout_is_retried(self, monkeypatch, _no_backoff):
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                raise httpx.ReadTimeout("timed out")
            return httpx.Response(200, json=[_ROW], request=httpx.Request("GET", url))

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        await fetch_dwelling_filings()
        assert len(attempts) == 2

    @pytest.mark.asyncio
    async def test_gives_up_after_the_attempt_ceiling(self, monkeypatch, _no_backoff):
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            raise httpx.ConnectError("no route to host")

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()
        assert len(attempts) == MAX_FETCH_ATTEMPTS

    @pytest.mark.asyncio
    async def test_backs_off_further_between_each_attempt(self, monkeypatch, _no_backoff):
        async def _get(self, url, **kwargs):
            raise httpx.ConnectError("no route to host")

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()
        assert _no_backoff == [
            RETRY_INITIAL_DELAY_SECONDS,
            RETRY_INITIAL_DELAY_SECONDS * 2,
        ]

    @pytest.mark.asyncio
    async def test_stops_once_the_wall_clock_budget_is_spent(
        self, monkeypatch, _no_backoff,
    ):
        # A slow feed has already spent the operator's patience on the first
        # attempt; a second full timeout would double the wait for the same
        # answer. The budget, not the attempt count, is what ends this one —
        # exhausted here by shrinking it rather than by faking the clock, which
        # is the same clock the event loop runs on.
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            raise httpx.ConnectTimeout("slow")

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        monkeypatch.setattr(client, "FETCH_BUDGET_SECONDS", 0.0)
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()
        assert len(attempts) == 1
        assert _no_backoff == []

    @pytest.mark.asyncio
    async def test_a_status_code_is_not_retried(self, monkeypatch, _no_backoff):
        # The server answered. Asking again gets the same answer and charges
        # the operator another round trip for it.
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            return httpx.Response(403, text="forbidden", request=httpx.Request("GET", url))

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()
        assert len(attempts) == 1

    @pytest.mark.asyncio
    async def test_unparseable_json_is_not_retried(self, monkeypatch, _no_backoff):
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            return httpx.Response(200, text="<html>nope", request=httpx.Request("GET", url))

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        with pytest.raises(RateFilingFeedUnavailableError):
            await fetch_dwelling_filings()
        assert len(attempts) == 1

    @pytest.mark.asyncio
    async def test_a_retried_success_is_cached_like_any_other(
        self, monkeypatch, _no_backoff,
    ):
        attempts: list[int] = []

        async def _get(self, url, **kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                raise httpx.ConnectError("[Errno -2] Name or service not known")
            return httpx.Response(200, json=[_ROW], request=httpx.Request("GET", url))

        monkeypatch.setattr(client.httpx.AsyncClient, "get", _get)
        await fetch_dwelling_filings()
        await fetch_dwelling_filings()
        assert len(attempts) == 2


def _stub_get(response: httpx.Response):
    async def _get(self, url, **kwargs):
        response.request = httpx.Request("GET", url)
        return response

    return _get
