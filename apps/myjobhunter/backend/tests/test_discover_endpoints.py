"""End-to-end tests for the /discover surface.

Mocks JSearch via patching the adapter's ``search`` function so no real
RapidAPI calls happen. Verifies:

- Saved-search CRUD (create / list / deactivate / cross-tenant 404)
- Refresh trigger calls JSearch and persists discovered_jobs rows
- Refresh maps adapter errors to the right HTTP status codes
- GET /discover returns the inbox view
- Dismiss / save toggle the right state columns
- Tenant isolation: user A cannot see / dismiss / save user B's rows
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.discovery.sources.jsearch import (
    JSearchAuthError,
    JSearchTransientError,
)


_SEARCH_PATH = "app.services.discovery.discovery_fetch_service.jsearch.search"


def _posting(**overrides):
    base = {
        "source": "jsearch",
        "source_external_id": "fake-id-1",
        "source_publisher": "LinkedIn",
        "source_url": "https://www.linkedin.com/jobs/view/1",
        "title": "Senior Backend Engineer",
        "company_name": "Acme",
        "location": "Remote",
        "remote_type": "remote",
        "description": "Looking for a senior backend engineer with 8+ years of Python.",
        "description_normalized": None,
        "content_hash": None,
        "posted_at": datetime(2026, 5, 6, 19, 0, tzinfo=timezone.utc),
        "salary_min": 150000.0,
        "salary_max": 200000.0,
        "salary_currency": "USD",
        "salary_period": "annual",
        "raw_payload": {"job_id": "fake-id-1"},
    }
    base.update(overrides)
    return base


# ===========================================================================
# Saved-search CRUD
# ===========================================================================


@pytest.mark.asyncio
async def test_create_source_201(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.post(
            "/discover/sources",
            json={
                "source": "jsearch",
                "config": {"query": "senior backend engineer python remote"},
                "fetch_interval_minutes": 360,
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["source"] == "jsearch"
    assert body["config"]["query"] == "senior backend engineer python remote"
    assert body["is_active"] is True
    assert body["fetch_interval_minutes"] == 360


@pytest.mark.asyncio
async def test_list_sources_returns_only_caller_rows(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    other = await user_factory()

    async with await as_user(owner) as a:
        await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "owner search"}},
        )
    async with await as_user(other) as a:
        await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "other search"}},
        )

    async with await as_user(owner) as a:
        resp = await a.get("/discover/sources")

    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["config"]["query"] == "owner search"


@pytest.mark.asyncio
async def test_delete_source_204_then_404(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        resp = await a.delete(f"/discover/sources/{source_id}")
        assert resp.status_code == 204

        # No longer in active list
        resp = await a.get("/discover/sources")
        assert resp.json() == []


@pytest.mark.asyncio
async def test_delete_source_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    attacker = await user_factory()
    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

    async with await as_user(attacker) as a:
        resp = await a.delete(f"/discover/sources/{source_id}")
        assert resp.status_code == 404


# ===========================================================================
# Refresh
# ===========================================================================


@pytest.mark.asyncio
async def test_refresh_source_persists_postings(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "python remote"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            resp = await a.post(f"/discover/sources/{source_id}/refresh")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "success"
    assert body["fetched_count"] == 1
    assert body["new_count"] == 1
    assert body["updated_count"] == 0


@pytest.mark.asyncio
async def test_refresh_source_idempotent_dedup(
    client: AsyncClient, user_factory, as_user,
):
    """Re-fetching the same posting hits ON CONFLICT DO UPDATE — no
    new row, but the updated_count increments."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")
            second = await a.post(f"/discover/sources/{source_id}/refresh")

    body = second.json()
    assert body["new_count"] == 0
    assert body["updated_count"] == 1


@pytest.mark.asyncio
async def test_refresh_source_404_when_not_owner(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    attacker = await user_factory()
    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

    async with await as_user(attacker) as a:
        resp = await a.post(f"/discover/sources/{source_id}/refresh")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_refresh_source_503_on_missing_api_key(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(
            _SEARCH_PATH,
            new_callable=AsyncMock,
            side_effect=JSearchAuthError("missing key"),
        ):
            resp = await a.post(f"/discover/sources/{source_id}/refresh")

    assert resp.status_code == 503
    assert "JSEARCH_API_KEY" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_refresh_source_502_on_transient_error(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(
            _SEARCH_PATH,
            new_callable=AsyncMock,
            side_effect=JSearchTransientError("upstream 503"),
        ):
            resp = await a.post(f"/discover/sources/{source_id}/refresh")

    assert resp.status_code == 502


# ===========================================================================
# Listing + state transitions
# ===========================================================================


@pytest.mark.asyncio
async def test_list_discovered_inbox_default(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        resp = await a.get("/discover")

    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "inbox"
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Senior Backend Engineer"
    assert body["items"][0]["dismissed_at"] is None
    assert body["items"][0]["saved_at"] is None


@pytest.mark.asyncio
async def test_dismiss_discovered_removes_from_inbox(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        resp = await a.post(f"/discover/{job_id}/dismiss")
        assert resp.status_code == 204

        listed_after = await a.get("/discover")
        assert listed_after.json()["total"] == 0


@pytest.mark.asyncio
async def test_save_discovered_moves_to_saved_state(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        resp = await a.post(f"/discover/{job_id}/save")
        assert resp.status_code == 204

        # Inbox should be empty.
        inbox = await a.get("/discover")
        assert inbox.json()["total"] == 0

        # Saved view should show it.
        saved = await a.get("/discover", params={"state": "saved"})
        assert saved.json()["total"] == 1
        assert saved.json()["items"][0]["id"] == job_id


@pytest.mark.asyncio
async def test_dismiss_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    attacker = await user_factory()
    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")
        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

    async with await as_user(attacker) as a:
        resp = await a.post(f"/discover/{job_id}/dismiss")
        assert resp.status_code == 404
