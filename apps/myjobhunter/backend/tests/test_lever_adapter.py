"""Tests for the Lever public job-board source adapter.

Mocks ``httpx.AsyncClient`` via ``httpx.MockTransport`` so no actual
HTTP calls happen. Verifies:

- Happy path: 200 OK with realistic Lever envelope → normalized postings
- 404 → LeverInvalidSlugError (invalid company_slug)
- 429 → LeverTransientError with tenacity retry (3 attempts)
- 500 → LeverTransientError with retry
- Success after one transient failure (retry recovers)
- Non-JSON body → LeverError
- Response is not a list → LeverError
- posted_at from epoch milliseconds
- company_name humanized from slug
- descriptionPlain preferred over HTML description
- Remote type derivation from categories.location
- Description truncation at 12k char cap
- Empty postings array → empty result list
"""
from __future__ import annotations

from datetime import timezone
from unittest.mock import patch

import httpx
import pytest

from app.services.discovery.sources import lever
from app.services.discovery.sources.lever import (
    LeverError,
    LeverInvalidSlugError,
    LeverTransientError,
    fetch_postings,
)

# Capture original AsyncClient before any patching.
_OriginalAsyncClient = httpx.AsyncClient


def _client_with_handler(handler):
    transport = httpx.MockTransport(handler)
    return _OriginalAsyncClient(transport=transport, timeout=30.0)


def _realistic_posting(**overrides) -> dict:
    """One realistic Lever postings-API entry."""
    base = {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "text": "Senior Backend Engineer",
        "categories": {
            "location": "San Francisco, CA",
            "commitment": "Full-time",
            "department": "Engineering",
        },
        "hostedUrl": "https://jobs.lever.co/stripe/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "descriptionPlain": "We are looking for a senior backend engineer with Python experience.",
        "description": "<p>We are looking for a <strong>senior backend engineer</strong> with Python experience.</p>",
        "createdAt": 1778094000000,  # epoch ms
        "updatedAt": 1778094000000,
    }
    base.update(overrides)
    return base


# ===========================================================================
# Happy path
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_postings_happy_path() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.lever.co"
        assert "/v0/postings/stripe" in request.url.path
        assert request.url.params["mode"] == "json"
        assert request.headers["User-Agent"].startswith("MyJobHunter/")
        return httpx.Response(200, json=[_realistic_posting()])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert len(results) == 1
    posting = results[0]
    assert posting["source"] == "lever"
    assert posting["source_external_id"] == "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    assert posting["source_publisher"] == "Lever"
    assert posting["title"] == "Senior Backend Engineer"
    assert posting["company_name"] == "Stripe"  # humanized from slug
    assert posting["location"] == "San Francisco, CA"
    assert posting["remote_type"] == "onsite"
    assert posting["source_url"] == (
        "https://jobs.lever.co/stripe/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    )
    assert posting["description"] == (
        "We are looking for a senior backend engineer with Python experience."
    )
    # posted_at: 1778094000000ms = valid UTC datetime
    assert posting["posted_at"] is not None
    assert posting["posted_at"].tzinfo is not None


@pytest.mark.asyncio
async def test_fetch_postings_prefers_plain_text_description() -> None:
    """descriptionPlain should be used over the HTML description field."""
    p = _realistic_posting(
        descriptionPlain="Plain text description.",
        description="<p>HTML description.</p>",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert results[0]["description"] == "Plain text description."


@pytest.mark.asyncio
async def test_fetch_postings_falls_back_to_html_description_when_plain_missing() -> None:
    p = _realistic_posting(descriptionPlain=None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    desc = results[0]["description"]
    assert desc is not None
    assert "<p>" not in desc
    assert "senior backend engineer" in desc


@pytest.mark.asyncio
async def test_fetch_postings_returns_empty_list_for_empty_array() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert results == []


@pytest.mark.asyncio
async def test_fetch_postings_skips_entries_missing_id() -> None:
    bad = _realistic_posting()
    del bad["id"]
    good = _realistic_posting(id="good-id-123")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[bad, good])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert len(results) == 1
    assert results[0]["source_external_id"] == "good-id-123"


@pytest.mark.asyncio
async def test_fetch_postings_truncates_long_description() -> None:
    p = _realistic_posting(descriptionPlain="x" * 50000)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    desc = results[0]["description"]
    assert desc is not None
    assert len(desc) == 12_000
    assert desc.endswith("…")


@pytest.mark.asyncio
async def test_fetch_postings_epoch_ms_parsed_correctly() -> None:
    """1778094000000 ms = 2026-05-02T15:00:00Z (roughly)."""
    p = _realistic_posting(createdAt=1746198000000)  # known epoch

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert results[0]["posted_at"] is not None
    assert results[0]["posted_at"].year == 2025


# ===========================================================================
# Humanize slug
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_postings_humanizes_multi_word_slug() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[_realistic_posting()])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="acme-corp-ltd")

    assert results[0]["company_name"] == "Acme Corp Ltd"


# ===========================================================================
# 404 — invalid slug
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_postings_raises_invalid_slug_error_on_404() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="not found")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(LeverInvalidSlugError) as exc_info:
            await fetch_postings(company_slug="nonexistent-co")

    assert "404" in str(exc_info.value) or "not found" in str(exc_info.value).lower()


# ===========================================================================
# Transient errors → tenacity retry, then propagate
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_postings_retries_on_429_then_propagates(monkeypatch) -> None:
    monkeypatch.setattr(
        lever, "fetch_postings",
        lever.fetch_postings.retry_with(wait=lambda _: 0),
    )
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(429, text="rate limited")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(LeverTransientError):
            await lever.fetch_postings(company_slug="stripe")

    assert call_count["n"] == 3


@pytest.mark.asyncio
async def test_fetch_postings_retries_on_500(monkeypatch) -> None:
    monkeypatch.setattr(
        lever, "fetch_postings",
        lever.fetch_postings.retry_with(wait=lambda _: 0),
    )
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(500, text="internal server error")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(LeverTransientError):
            await lever.fetch_postings(company_slug="stripe")

    assert call_count["n"] == 3


@pytest.mark.asyncio
async def test_fetch_postings_succeeds_after_one_transient(monkeypatch) -> None:
    monkeypatch.setattr(
        lever, "fetch_postings",
        lever.fetch_postings.retry_with(wait=lambda _: 0),
    )
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, json=[_realistic_posting()])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await lever.fetch_postings(company_slug="stripe")

    assert len(results) == 1
    assert call_count["n"] == 2


# ===========================================================================
# Malformed responses
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_postings_raises_on_non_json_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json at all")

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(LeverError):
            await fetch_postings(company_slug="stripe")


@pytest.mark.asyncio
async def test_fetch_postings_raises_when_response_is_not_list() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": []})

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        with pytest.raises(LeverError):
            await fetch_postings(company_slug="stripe")


# ===========================================================================
# Remote type derivation
# ===========================================================================


@pytest.mark.asyncio
async def test_fetch_postings_remote_type_from_remote_location() -> None:
    p = _realistic_posting(categories={"location": "Remote"})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert results[0]["remote_type"] == "remote"


@pytest.mark.asyncio
async def test_fetch_postings_remote_type_hybrid() -> None:
    p = _realistic_posting(categories={"location": "New York / Hybrid"})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert results[0]["remote_type"] == "hybrid"


@pytest.mark.asyncio
async def test_fetch_postings_remote_type_unknown_when_no_location() -> None:
    p = _realistic_posting(categories={})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[p])

    with patch.object(httpx, "AsyncClient", lambda *a, **kw: _client_with_handler(handler)):
        results = await fetch_postings(company_slug="stripe")

    assert results[0]["remote_type"] == "unknown"


# ===========================================================================
# excluded_keywords config field (tech debt 2026-05-11)
# ===========================================================================


def test_lever_source_config_accepts_excluded_keywords() -> None:
    """excluded_keywords is a valid field on LeverSourceConfig."""
    from app.schemas.discovery.lever_source_config import LeverSourceConfig

    cfg = LeverSourceConfig(
        company_slug="openai",
        excluded_keywords=["junior", "intern"],
    )
    assert cfg.excluded_keywords == ["junior", "intern"]


def test_lever_source_config_excluded_keywords_defaults_empty() -> None:
    """excluded_keywords defaults to [] when not supplied."""
    from app.schemas.discovery.lever_source_config import LeverSourceConfig

    cfg = LeverSourceConfig(company_slug="openai")
    assert cfg.excluded_keywords == []


def test_lever_source_config_parse_or_default_accepts_excluded_keywords() -> None:
    """parse_or_default round-trips excluded_keywords from raw JSONB."""
    from app.schemas.discovery.lever_source_config import LeverSourceConfig

    raw = {"company_slug": "openai", "excluded_keywords": ["junior"]}
    cfg = LeverSourceConfig.parse_or_default(raw)
    assert cfg.excluded_keywords == ["junior"]
