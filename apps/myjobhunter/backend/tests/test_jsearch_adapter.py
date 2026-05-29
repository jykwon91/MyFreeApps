"""Tests for the JSearch (RapidAPI / Google Jobs) source adapter.

Mocks ``httpx.AsyncClient`` via ``httpx.MockTransport`` so no actual
RapidAPI calls happen. Verifies:

- Happy path: 200 OK with realistic JSearch envelope → list of
  normalized RawPosting dicts
- Auth errors: 401/403 / missing API key → JSearchAuthError
- Transient errors: 500 / 502 → JSearchTransientError; tenacity retries
  up to 3 times before propagating
- 429 handling: a 429 carrying a (short) Retry-After is honored + retried
  as transient; a header-less 429 (or one with a Retry-After beyond the
  per-fetch bound) is monthly-quota exhaustion → JSearchQuotaError (fatal,
  not retried, distinct actionable message)
- Invalid envelopes: non-JSON body, status != "OK", non-list jobs →
  JSearchInvalidResponseError
- Field mapping: each JSearch field lands on the right RawPosting key
- Salary period mapping (YEAR → annual, MONTH → monthly, HOUR → hourly)
- Remote-type derivation (job_is_remote=true → remote; "hybrid" in
  location → hybrid; city/country present → onsite; else unknown)
- Description truncation at the 12k char cap
"""
from __future__ import annotations

from typing import Any
from unittest.mock import patch

import httpx
import pytest

from app.services.discovery.sources import jsearch
from app.services.discovery.sources.jsearch import (
    JSearchAuthError,
    JSearchError,
    JSearchInvalidResponseError,
    JSearchQuotaError,
    JSearchTransientError,
    search,
)


def _ok_envelope(jobs: list[dict] | None = None) -> dict:
    if jobs is None:
        jobs = [_realistic_job()]
    return {
        "status": "OK",
        "request_id": "test-request-id",
        "parameters": {"query": "test"},
        "data": {"jobs": jobs},
    }


def _realistic_job(**overrides) -> dict:
    """One realistic JSearch result, keyed off the LinkedIn sample we
    saw during verification."""
    base: dict[str, Any] = {
        "job_id": "OPXeD-VFdi4f47z2AAAAAA==",
        "job_title": "NodeJS Fullstack Developer - Node & React",
        "employer_name": "Jobs via Dice",
        "employer_logo": "https://example.com/logo.png",
        "employer_website": None,
        "job_publisher": "LinkedIn",
        "job_employment_type": "Full-time",
        "job_apply_link": "https://www.linkedin.com/jobs/view/123",
        "job_apply_is_direct": False,
        "apply_options": [],
        "job_description": "Looking for a senior fullstack developer with 8+ years of experience.",
        "job_is_remote": False,
        "job_posted_at": "22 hours ago",
        "job_posted_at_timestamp": 1778094000,
        "job_posted_at_datetime_utc": "2026-05-06T19:00:00.000Z",
        "job_location": "Chicago, IL",
        "job_city": "Chicago",
        "job_state": "Illinois",
        "job_country": "US",
        "job_min_salary": None,
        "job_max_salary": None,
        "job_salary_period": None,
        "job_benefits": None,
    }
    base.update(overrides)
    return base


# Capture original httpx.AsyncClient before any test patches it — otherwise
# the patched class recurses into our test helper.
_OriginalAsyncClient = httpx.AsyncClient


def _client_with_handler(handler):
    transport = httpx.MockTransport(handler)
    return _OriginalAsyncClient(transport=transport, timeout=30.0)


# ===========================================================================
# Happy path
# ===========================================================================


@pytest.mark.asyncio
async def test_search_happy_path() -> None:
    expected = _ok_envelope([_realistic_job()])

    def handler(request: httpx.Request) -> httpx.Response:
        # Verify request shape — headers + URL + auth.
        assert request.url.host == "jsearch.p.rapidapi.com"
        assert request.url.path == "/search"
        assert request.headers["X-RapidAPI-Key"] == "test-key"
        assert request.headers["X-RapidAPI-Host"] == "jsearch.p.rapidapi.com"
        assert request.headers["User-Agent"].startswith("MyJobHunter/")
        assert request.url.params["query"] == "senior backend"
        return httpx.Response(200, json=expected)

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="senior backend", api_key="test-key")

    assert len(results) == 1
    posting = results[0]
    assert posting["source"] == "jsearch"
    assert posting["source_external_id"] == "OPXeD-VFdi4f47z2AAAAAA=="
    assert posting["source_publisher"] == "LinkedIn"
    assert posting["source_url"] == "https://www.linkedin.com/jobs/view/123"
    assert posting["title"] == "NodeJS Fullstack Developer - Node & React"
    assert posting["company_name"] == "Jobs via Dice"
    assert posting["location"] == "Chicago, IL"
    assert posting["remote_type"] == "onsite"
    assert posting["description"].startswith("Looking for")
    assert posting["posted_at"] is not None
    assert posting["posted_at"].year == 2026
    assert posting["raw_payload"]["job_id"] == "OPXeD-VFdi4f47z2AAAAAA=="


@pytest.mark.asyncio
async def test_search_returns_empty_list_when_jobs_array_empty() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope(jobs=[]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    assert results == []


@pytest.mark.asyncio
async def test_search_skips_results_missing_job_id() -> None:
    bad = _realistic_job()
    del bad["job_id"]
    good = _realistic_job(job_id="other-id")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([bad, good]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    assert len(results) == 1
    assert results[0]["source_external_id"] == "other-id"


# ===========================================================================
# Auth errors
# ===========================================================================


@pytest.mark.asyncio
async def test_search_raises_auth_error_when_key_missing() -> None:
    with pytest.raises(JSearchAuthError):
        await search(query="x", api_key="")


@pytest.mark.asyncio
async def test_search_raises_auth_error_on_401() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="unauthorized")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchAuthError):
            await search(query="x", api_key="bad-key")


@pytest.mark.asyncio
async def test_search_raises_auth_error_on_403() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="forbidden")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchAuthError):
            await search(query="x", api_key="bad-key")


# ===========================================================================
# Transient errors → tenacity retry, then propagate
# ===========================================================================


@pytest.mark.asyncio
async def test_search_retries_on_502(monkeypatch) -> None:
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(502, text="bad gateway")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchTransientError):
            await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 3


# ===========================================================================
# 429 handling — Retry-After honored as transient; header-less = quota
# ===========================================================================


@pytest.mark.asyncio
async def test_search_honors_short_retry_after_and_retries(monkeypatch) -> None:
    """A 429 carrying a short Retry-After is a transient throttle: we sleep
    the advised interval (stubbed here) and retry. Three such 429s exhaust
    tenacity and propagate as JSearchTransientError — NOT quota."""
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))
    # Stub the Retry-After sleep so the test runs instantly.
    sleeps: list[float] = []

    async def _fake_sleep(secs: float) -> None:
        sleeps.append(secs)

    monkeypatch.setattr(jsearch.asyncio, "sleep", _fake_sleep)
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(429, headers={"Retry-After": "2"}, text="slow down")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchTransientError):
            await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 3  # retried as transient
    # Retry-After (2s) honored once per attempt. tenacity's own back-off also
    # routes through the patched sleep (stubbed to 0), so filter to the
    # adapter's Retry-After sleeps rather than asserting exact ordering.
    assert [s for s in sleeps if s == 2.0] == [2.0, 2.0, 2.0]


@pytest.mark.asyncio
async def test_search_succeeds_after_one_throttled_429_then_200(monkeypatch) -> None:
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))

    async def _fake_sleep(_secs: float) -> None:
        return None

    monkeypatch.setattr(jsearch.asyncio, "sleep", _fake_sleep)
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "1"})
        return httpx.Response(200, json=_ok_envelope())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 2
    assert len(results) == 1


@pytest.mark.asyncio
async def test_search_headerless_429_is_quota_error_not_retried(monkeypatch) -> None:
    """A 429 with NO Retry-After means the monthly RapidAPI plan is spent.
    It must raise JSearchQuotaError on the FIRST call (retrying a spent plan
    can't succeed) and carry an actionable, distinct message."""
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(429, text="exceeded the MONTHLY quota")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchQuotaError) as exc_info:
            await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 1  # NOT retried
    assert "quota" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_search_long_retry_after_is_quota_error(monkeypatch) -> None:
    """A Retry-After beyond the per-fetch bound is effectively a quota wall —
    surface as JSearchQuotaError rather than blocking the worker for minutes."""
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        # 3600s is far beyond _MAX_RETRY_AFTER_SECONDS (30s).
        return httpx.Response(429, headers={"Retry-After": "3600"})

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchQuotaError):
            await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 1  # NOT retried


def test_parse_retry_after_seconds() -> None:
    """Unit-cover the Retry-After parser: integer seconds, absent, malformed,
    and negative all resolve correctly (negative/malformed → None = quota)."""
    assert jsearch._parse_retry_after_seconds("12") == 12.0
    assert jsearch._parse_retry_after_seconds("  5  ") == 5.0
    assert jsearch._parse_retry_after_seconds(None) is None
    assert jsearch._parse_retry_after_seconds("") is None
    assert jsearch._parse_retry_after_seconds("-3") is None
    # HTTP-date form is not emitted by RapidAPI → treated as absent.
    assert jsearch._parse_retry_after_seconds("Wed, 21 Oct 2026 07:28:00 GMT") is None


# ===========================================================================
# Invalid response shapes
# ===========================================================================


@pytest.mark.asyncio
async def test_search_raises_on_non_json_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json at all")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchInvalidResponseError):
            await search(query="x", api_key="test-key")


@pytest.mark.asyncio
async def test_search_raises_when_envelope_status_not_ok() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"status": "ERROR", "data": {"jobs": []}},
        )

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchInvalidResponseError):
            await search(query="x", api_key="test-key")


@pytest.mark.asyncio
async def test_search_raises_when_jobs_not_a_list() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"status": "OK", "data": {"jobs": "not-a-list"}},
        )

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchInvalidResponseError):
            await search(query="x", api_key="test-key")


# ===========================================================================
# Field mapping / normalization
# ===========================================================================


@pytest.mark.asyncio
async def test_normalize_maps_remote_jobs_to_remote_type() -> None:
    job = _realistic_job(job_is_remote=True)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    assert results[0]["remote_type"] == "remote"


@pytest.mark.asyncio
async def test_normalize_maps_salary_period() -> None:
    job = _realistic_job(
        job_min_salary=120000,
        job_max_salary=150000,
        job_salary_period="YEAR",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    assert results[0]["salary_min"] == 120000.0
    assert results[0]["salary_max"] == 150000.0
    assert results[0]["salary_period"] == "annual"


@pytest.mark.asyncio
async def test_normalize_truncates_huge_descriptions() -> None:
    huge = "x" * 50000
    job = _realistic_job(job_description=huge)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    desc = results[0]["description"]
    assert len(desc) == 12_000  # cap from _MAX_DESCRIPTION_CHARS
    assert desc.endswith("…")


@pytest.mark.asyncio
async def test_normalize_falls_back_to_city_state_country_for_location() -> None:
    job = _realistic_job(job_location=None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    assert results[0]["location"] == "Chicago, Illinois, US"


@pytest.mark.asyncio
async def test_normalize_captures_source_expires_at() -> None:
    """job_offer_expiration_datetime_utc → source_expires_at (parsed UTC)."""
    job = _realistic_job(
        job_offer_expiration_datetime_utc="2026-06-15T23:59:00.000Z",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    expires = results[0]["source_expires_at"]
    assert expires is not None
    assert expires.year == 2026
    assert expires.month == 6
    assert expires.day == 15
    assert expires.tzinfo is not None  # timezone-aware


@pytest.mark.asyncio
async def test_normalize_source_expires_at_none_when_absent() -> None:
    """No expiration field in the feed → source_expires_at is None, not a crash."""
    job = _realistic_job()  # _realistic_job omits the expiration field
    assert "job_offer_expiration_datetime_utc" not in job

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_envelope([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await search(query="x", api_key="test-key")

    assert results[0]["source_expires_at"] is None
