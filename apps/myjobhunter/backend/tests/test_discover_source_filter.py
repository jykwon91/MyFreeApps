"""Tests for ?source_id= filter on GET /discover.

Verifies:
- Unfiltered list returns postings from all sources
- source_id filter restricts to postings from the matching saved search
- Unknown / wrong-tenant source_id returns empty list (not 404)
- discovery_source_id is populated on every returned item
- Tenant isolation still holds when source_id is provided
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource


_SEARCH_PATH = "app.services.discovery.discovery_fetch_service.jsearch.search"
_SCORE_PATH = "app.services.discovery.discovery_score_service.score_user_inbox"
_EMBED_PATH = "app.services.discovery.discovery_embedding_service.embed_pending_for_user_background"


def _posting(**overrides) -> dict:
    base = {
        "source": "jsearch",
        "source_external_id": f"ext-{uuid.uuid4()}",
        "source_publisher": None,
        "source_url": "https://example.com/job/1",
        "title": "Backend Engineer",
        "company_name": "Acme",
        "location": "Remote",
        "remote_type": "remote",
        "description": "Python role",
        "description_normalized": None,
        "content_hash": None,
        "posted_at": datetime(2026, 5, 6, 19, 0, tzinfo=timezone.utc),
        "salary_min": None,
        "salary_max": None,
        "salary_currency": "USD",
        "salary_period": None,
        "raw_payload": {},
    }
    base.update(overrides)
    return base


async def _create_source_and_refresh(
    client,
    *,
    query: str = "python remote",
    name: str = "",
    posting_overrides: dict | None = None,
) -> tuple[str, str]:
    """Create a saved search, refresh it once, return (source_id, job_id)."""
    created = await client.post(
        "/discover/sources",
        json={"source": "jsearch", "name": name, "config": {"query": query}},
    )
    assert created.status_code == 201, created.text
    source_id = created.json()["id"]

    posting = _posting(**(posting_overrides or {}))
    with (
        patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[posting]),
        patch(_SCORE_PATH, new_callable=AsyncMock, return_value=None),
        patch(_EMBED_PATH, new_callable=AsyncMock, return_value=None),
    ):
        resp = await client.post(f"/discover/sources/{source_id}/refresh")
    assert resp.status_code == 200, resp.text

    listed = await client.get("/discover")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) >= 1
    # The most recently discovered posting for this source.
    job_id = items[0]["id"]
    return source_id, job_id


# ===========================================================================
# discovery_source_id is populated on all list paths
# ===========================================================================


@pytest.mark.asyncio
async def test_list_discovered_includes_discovery_source_id(
    client: AsyncClient, user_factory, as_user,
):
    """Every item in the inbox response carries a non-null discovery_source_id
    when the job was created via a fetch."""
    user = await user_factory()
    async with await as_user(user) as a:
        source_id, job_id = await _create_source_and_refresh(a)

        resp = await a.get("/discover")
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["id"] == job_id
    assert item["discovery_source_id"] == source_id


@pytest.mark.asyncio
async def test_list_discovered_null_discovery_source_id_for_legacy_row(
    db: AsyncSession, user_factory, as_user, client: AsyncClient,
):
    """A row inserted without a fetch_id (legacy / direct insertion) gets
    discovery_source_id = null in the response — not a serialisation error."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id="legacy-no-fetch",
        title="Legacy Job",
        company_name="OldCo",
        fetch_id=None,  # no fetch → no source linkage
    )
    db.add(job)
    await db.flush()

    async with await as_user(user) as a:
        resp = await a.get("/discover", params={"state": "all"})

    assert resp.status_code == 200
    items = resp.json()["items"]
    legacy = next((i for i in items if i["id"] == str(job.id)), None)
    assert legacy is not None, "legacy row not in response"
    assert legacy["discovery_source_id"] is None


# ===========================================================================
# source_id filter — happy path
# ===========================================================================


@pytest.mark.asyncio
async def test_source_id_filter_returns_only_matching_postings(
    client: AsyncClient, user_factory, as_user,
):
    """When ?source_id=<uuid> is given, only postings from that search appear."""
    user = await user_factory()
    async with await as_user(user) as a:
        source_a_id, job_a_id = await _create_source_and_refresh(
            a,
            query="python backend remote",
            name="Search A",
            posting_overrides={"source_external_id": "ext-A", "title": "Backend A"},
        )
        source_b_id, job_b_id = await _create_source_and_refresh(
            a,
            query="frontend react remote",
            name="Search B",
            posting_overrides={"source_external_id": "ext-B", "title": "Frontend B"},
        )

        # Unfiltered: both postings visible
        unfiltered = await a.get("/discover")
        assert unfiltered.json()["total"] == 2

        # Filtered to source A: only job A
        filtered_a = await a.get("/discover", params={"source_id": source_a_id})
        assert filtered_a.status_code == 200
        items_a = filtered_a.json()["items"]
        assert len(items_a) == 1
        assert items_a[0]["id"] == job_a_id
        assert items_a[0]["discovery_source_id"] == source_a_id

        # Filtered to source B: only job B
        filtered_b = await a.get("/discover", params={"source_id": source_b_id})
        assert filtered_b.status_code == 200
        items_b = filtered_b.json()["items"]
        assert len(items_b) == 1
        assert items_b[0]["id"] == job_b_id
        assert items_b[0]["discovery_source_id"] == source_b_id


# ===========================================================================
# source_id filter — unknown / wrong-tenant source returns empty
# ===========================================================================


@pytest.mark.asyncio
async def test_source_id_filter_unknown_source_returns_empty(
    client: AsyncClient, user_factory, as_user,
):
    """A source_id that doesn't exist (or belongs to another user) yields
    an empty list — not a 404 or 422.  The frontend treats empty the same
    as 'no results for this filter'."""
    user = await user_factory()
    async with await as_user(user) as a:
        # Seed one posting so the user's inbox is not empty.
        await _create_source_and_refresh(a)

        unknown_id = str(uuid.uuid4())
        resp = await a.get("/discover", params={"source_id": unknown_id})

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_source_id_filter_cross_tenant_isolation(
    client: AsyncClient, user_factory, as_user,
):
    """User B supplying user A's source_id sees an empty list (tenant isolation)."""
    owner = await user_factory()
    attacker = await user_factory()

    async with await as_user(owner) as a:
        source_id, _ = await _create_source_and_refresh(a)

    # Attacker tries to filter by owner's source_id.
    async with await as_user(attacker) as a:
        resp = await a.get("/discover", params={"source_id": source_id})

    assert resp.status_code == 200
    assert resp.json()["total"] == 0


# ===========================================================================
# source_id filter works with state parameter
# ===========================================================================


@pytest.mark.asyncio
async def test_source_id_filter_with_state_saved(
    client: AsyncClient, user_factory, as_user,
):
    """source_id filter is honoured in the 'saved' state view too."""
    user = await user_factory()
    async with await as_user(user) as a:
        source_a_id, job_a_id = await _create_source_and_refresh(
            a,
            query="python backend",
            name="Search A",
            posting_overrides={"source_external_id": "sa-1", "title": "A saved"},
        )
        source_b_id, job_b_id = await _create_source_and_refresh(
            a,
            query="frontend react",
            name="Search B",
            posting_overrides={"source_external_id": "sb-1", "title": "B saved"},
        )

        # Save both jobs.
        await a.post(f"/discover/{job_a_id}/save")
        await a.post(f"/discover/{job_b_id}/save")

        # Filter saved by source A.
        resp = await a.get(
            "/discover", params={"state": "saved", "source_id": source_a_id},
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == job_a_id
