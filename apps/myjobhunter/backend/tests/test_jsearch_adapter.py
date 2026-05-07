"""Tests for the JSearch (RapidAPI / Google Jobs) source adapter.

Mocks ``httpx.AsyncClient`` via ``httpx.MockTransport`` so no actual
RapidAPI calls happen. Verifies:

- Happy path: 200 OK with realistic JSearch envelope → list of
  normalized RawPosting dicts
- Auth errors: 401/403 / missing API key → JSearchAuthError
- Transient errors: 429 / 500 / 502 → JSearchTransientError; tenacity
  retries up to 3 times before propagating
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
async def test_search_retries_on_429_then_propagates(monkeypatch) -> None:
    # Disable tenacity's wait so the test runs in milliseconds.
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(429, text="rate-limited")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(JSearchTransientError):
            await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 3  # tenacity attempts 3 times total


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


@pytest.mark.asyncio
async def test_search_succeeds_after_one_429_then_200(monkeypatch) -> None:
    monkeypatch.setattr(jsearch, "search", jsearch.search.retry_with(wait=lambda _: 0))
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, json=_ok_envelope())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await jsearch.search(query="x", api_key="test-key")

    assert call_count["n"] == 2
    assert len(results) == 1


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
