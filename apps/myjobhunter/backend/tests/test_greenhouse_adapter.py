"""Tests for the Greenhouse public job-board source adapter.

Mocks ``httpx.AsyncClient`` via ``httpx.MockTransport`` so no actual
HTTP calls happen. Verifies:

- Happy path: 200 OK with realistic Greenhouse envelope → normalized
  RawPosting dicts
- 404 → GreenhouseInvalidBoardError (invalid board_token)
- 429 → GreenhouseTransientError with tenacity retry (3 attempts)
- 500 → GreenhouseTransientError with retry
- Success after one transient failure (retry recovers)
- Non-JSON body → GreenhouseError
- Unexpected jobs shape (not list) → GreenhouseError
- HTML stripping: <p>, <br>, <li>, <h2> tags removed
- Remote type derivation from location string
- Description truncation at 12k char cap
- company_name fetched from board metadata endpoint
- Empty jobs array → empty result list
- company_name cache hit: skips metadata call, uses cached name
- company_name cache miss: calls metadata, returns resolved name
- resolved_company_name returned in result tuple
"""
from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest

from app.schemas.discovery.greenhouse_source_config import (
    GreenhouseFetchConfig,
    GreenhouseSourceConfig,
)
from app.services.discovery.sources import greenhouse
from app.services.discovery.sources.greenhouse import (
    GreenhouseError,
    GreenhouseInvalidBoardError,
    GreenhouseTransientError,
    fetch_board,
)

# Capture original AsyncClient before any patching.
_OriginalAsyncClient = httpx.AsyncClient


def _client_with_handler(handler):
    transport = httpx.MockTransport(handler)
    return _OriginalAsyncClient(transport=transport, timeout=30.0)


def _realistic_job(**overrides) -> dict:
    """One realistic Greenhouse jobs-feed entry."""
    base = {
        "id": 4001234,
        "title": "Senior Software Engineer",
        "location": {"name": "San Francisco, CA"},
        "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4001234",
        "content": "<p>We're looking for a <strong>senior engineer</strong>.</p><ul><li>5+ years Python</li><li>Distributed systems experience</li></ul>",
        "updated_at": "2026-05-10T14:30:00-07:00",
        "requisition_id": "REQ-1234",
        "metadata": [],
    }
    base.update(overrides)
    return base


def _board_response(jobs: list | None = None) -> dict:
    return {"jobs": jobs if jobs is not None else [_realistic_job()], "meta": {"total": 1}}


def _company_response() -> dict:
    return {"name": "Stripe", "id": "stripe", "url": "https://www.stripe.com"}


# Multi-handler helper: first call = company name, second call = jobs.
# (fetch_board calls the metadata endpoint then the jobs endpoint)
class _TwoCallHandler:
    def __init__(self, company_resp, jobs_resp):
        self._company_resp = company_resp
        self._jobs_resp = jobs_resp
        self._call_count = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self._call_count += 1
        # The company name call hits /{board_token} (no query params).
        # The jobs call hits /{board_token}/jobs?content=true.
        if "jobs" in request.url.path:
            return httpx.Response(200, json=self._jobs_resp)
        return httpx.Response(200, json=self._company_resp)


# ===========================================================================
# Happy path
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_happy_path() -> None:
    handler = _TwoCallHandler(_company_response(), _board_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, resolved_name = await fetch_board(board_token="stripe")

    assert len(results) == 1
    posting = results[0]
    assert posting["source"] == "greenhouse"
    assert posting["source_external_id"] == "4001234"
    assert posting["source_publisher"] == "Greenhouse"
    assert posting["title"] == "Senior Software Engineer"
    assert posting["company_name"] == "Stripe"
    assert posting["location"] == "San Francisco, CA"
    assert posting["remote_type"] == "onsite"
    assert posting["source_url"] == "https://boards.greenhouse.io/stripe/jobs/4001234"
    assert posting["posted_at"] is not None
    # Salary fields are None — Greenhouse feed doesn't include comp
    assert posting["salary_min"] is None
    assert posting["salary_max"] is None
    # raw_payload preserved
    assert posting["raw_payload"]["id"] == 4001234
    # resolved name returned for caller to cache
    assert resolved_name == "Stripe"


@pytest.mark.asyncio
async def test_fetch_board_strips_html_from_description() -> None:
    job = _realistic_job(
        content="<p>We're looking for a <strong>senior engineer</strong>.</p>"
                "<ul><li>5+ years Python</li><li>Distributed systems</li></ul>",
    )
    handler = _TwoCallHandler(_company_response(), _board_response([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    desc = results[0]["description"]
    assert desc is not None
    assert "<p>" not in desc
    assert "<ul>" not in desc
    assert "<li>" not in desc
    assert "senior engineer" in desc
    assert "5+ years Python" in desc


@pytest.mark.asyncio
async def test_fetch_board_returns_empty_list_for_empty_jobs() -> None:
    handler = _TwoCallHandler(_company_response(), {"jobs": []})

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    assert results == []


@pytest.mark.asyncio
async def test_fetch_board_skips_jobs_missing_id() -> None:
    bad_job = _realistic_job()
    del bad_job["id"]
    good_job = _realistic_job(id=9999)
    handler = _TwoCallHandler(_company_response(), _board_response([bad_job, good_job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    assert len(results) == 1
    assert results[0]["source_external_id"] == "9999"


@pytest.mark.asyncio
async def test_fetch_board_truncates_long_description() -> None:
    job = _realistic_job(content="x" * 50000)
    handler = _TwoCallHandler(_company_response(), _board_response([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    desc = results[0]["description"]
    assert desc is not None
    assert len(desc) == 12_000
    assert desc.endswith("…")


# ===========================================================================
# 404 — invalid board token
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_raises_invalid_board_error_on_404() -> None:
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        if "jobs" in request.url.path:
            return httpx.Response(404, text="not found")
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(GreenhouseInvalidBoardError) as exc_info:
            await fetch_board(board_token="nonexistent-board")

    assert "not found" in str(exc_info.value).lower() or "404" in str(exc_info.value)


# ===========================================================================
# Transient errors → tenacity retry, then propagate
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_retries_on_429_then_propagates(monkeypatch) -> None:
    monkeypatch.setattr(
        greenhouse, "fetch_board",
        greenhouse.fetch_board.retry_with(wait=lambda _: 0),
    )
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            call_count["n"] += 1
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(GreenhouseTransientError):
            await greenhouse.fetch_board(board_token="stripe")

    assert call_count["n"] == 3  # 3 attempts before propagating


@pytest.mark.asyncio
async def test_fetch_board_retries_on_500(monkeypatch) -> None:
    monkeypatch.setattr(
        greenhouse, "fetch_board",
        greenhouse.fetch_board.retry_with(wait=lambda _: 0),
    )
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            call_count["n"] += 1
            return httpx.Response(500, text="internal server error")
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(GreenhouseTransientError):
            await greenhouse.fetch_board(board_token="stripe")

    assert call_count["n"] == 3


@pytest.mark.asyncio
async def test_fetch_board_succeeds_after_one_transient(monkeypatch) -> None:
    monkeypatch.setattr(
        greenhouse, "fetch_board",
        greenhouse.fetch_board.retry_with(wait=lambda _: 0),
    )
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            call_count["n"] += 1
            if call_count["n"] == 1:
                return httpx.Response(429, text="rate limited")
            return httpx.Response(200, json=_board_response())
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await greenhouse.fetch_board(board_token="stripe")

    assert len(results) == 1
    assert call_count["n"] == 2


# ===========================================================================
# Malformed responses
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_raises_on_non_json_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            return httpx.Response(200, text="not json")
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(GreenhouseError):
            await fetch_board(board_token="stripe")


@pytest.mark.asyncio
async def test_fetch_board_raises_when_jobs_not_list() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            return httpx.Response(200, json={"jobs": "not-a-list"})
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(GreenhouseError):
            await fetch_board(board_token="stripe")


# ===========================================================================
# Remote type derivation
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_remote_type_from_location_remote() -> None:
    job = _realistic_job(location={"name": "Remote"})
    handler = _TwoCallHandler(_company_response(), _board_response([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    assert results[0]["remote_type"] == "remote"


@pytest.mark.asyncio
async def test_fetch_board_remote_type_hybrid() -> None:
    job = _realistic_job(location={"name": "New York / Hybrid"})
    handler = _TwoCallHandler(_company_response(), _board_response([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    assert results[0]["remote_type"] == "hybrid"


@pytest.mark.asyncio
async def test_fetch_board_remote_type_unknown_when_no_location() -> None:
    job = _realistic_job(location=None)
    handler = _TwoCallHandler(_company_response(), _board_response([job]))

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, _ = await fetch_board(board_token="stripe")

    assert results[0]["remote_type"] == "unknown"


# ===========================================================================
# Company name fallback
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_falls_back_to_board_token_when_company_fetch_fails() -> None:
    """If the company metadata endpoint fails, board_token is used as the name."""
    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            return httpx.Response(200, json=_board_response())
        # Company metadata endpoint fails
        return httpx.Response(500, text="server error")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, resolved_name = await fetch_board(board_token="stripe")

    assert results[0]["company_name"] == "stripe"
    # Fallback name equals board_token, so resolved_company_name is None
    # (nothing new to cache — it's already implied by the board_token).
    assert resolved_name is None


# ===========================================================================
# Company name caching — Item 1 from tech debt cleanup (2026-05-11)
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_board_uses_cached_name_and_skips_metadata_call() -> None:
    """When resolved_company_name is cached in config, no metadata HTTP call."""
    metadata_call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "jobs" in request.url.path:
            return httpx.Response(200, json=_board_response())
        # Should not be reached — metadata call should be skipped.
        metadata_call_count["n"] += 1
        return httpx.Response(200, json=_company_response())

    config = GreenhouseFetchConfig(
        board_token="stripe",
        resolved_company_name="Stripe (cached)",
    )

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, resolved_name = await fetch_board(board_token="stripe", config=config)

    # Cached name used; metadata endpoint never called.
    assert metadata_call_count["n"] == 0
    assert results[0]["company_name"] == "Stripe (cached)"
    # resolved_name echoes the cache — no update needed.
    assert resolved_name == "Stripe (cached)"


@pytest.mark.asyncio
async def test_fetch_board_returns_resolved_name_for_caller_to_cache() -> None:
    """On first fetch (no cached name), resolved_company_name is returned."""
    handler = _TwoCallHandler(_company_response(), _board_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results, resolved_name = await fetch_board(board_token="stripe")

    # The metadata endpoint returned "Stripe"; caller should cache it.
    assert resolved_name == "Stripe"
    assert results[0]["company_name"] == "Stripe"


@pytest.mark.asyncio
async def test_fetch_board_metadata_call_count_without_cache() -> None:
    """Without a cached name exactly one metadata call is made per fetch_board."""
    handler = _TwoCallHandler(_company_response(), _board_response())
    calls = []

    original_init = _OriginalAsyncClient.__init__

    def tracking_handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if "jobs" in request.url.path:
            return httpx.Response(200, json=_board_response())
        return httpx.Response(200, json=_company_response())

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(tracking_handler)):
        await fetch_board(board_token="stripe")

    metadata_calls = [p for p in calls if "jobs" not in p]
    jobs_calls = [p for p in calls if "jobs" in p]
    assert len(metadata_calls) == 1
    assert len(jobs_calls) == 1


# ===========================================================================
# excluded_keywords filter (Item 2 — Greenhouse config field)
# ===========================================================================


@pytest.mark.asyncio
async def test_greenhouse_source_config_accepts_excluded_keywords() -> None:
    """excluded_keywords is a valid field on GreenhouseSourceConfig."""
    cfg = GreenhouseSourceConfig(
        board_token="stripe",
        excluded_keywords=["junior", "intern"],
    )
    assert cfg.excluded_keywords == ["junior", "intern"]


@pytest.mark.asyncio
async def test_greenhouse_source_config_excluded_keywords_defaults_empty() -> None:
    """excluded_keywords defaults to [] when not supplied."""
    cfg = GreenhouseSourceConfig(board_token="stripe")
    assert cfg.excluded_keywords == []


@pytest.mark.asyncio
async def test_greenhouse_fetch_config_round_trips_excluded_keywords() -> None:
    """GreenhouseFetchConfig parses excluded_keywords from raw JSONB dict."""
    raw = {
        "board_token": "stripe",
        "excluded_keywords": ["junior"],
        "resolved_company_name": "Stripe",
    }
    cfg = GreenhouseFetchConfig.model_validate(raw)
    assert cfg.excluded_keywords == ["junior"]
    assert cfg.resolved_company_name == "Stripe"
