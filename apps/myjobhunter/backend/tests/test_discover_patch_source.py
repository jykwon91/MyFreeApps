"""Tests for PATCH /discover/sources/{id} — edit saved-search settings.

Verifies:
- Happy path: partial update of fetch_interval_minutes returns 200 + updated row
- Partial update of name returns 200
- Empty body (no fields) returns 422
- Invalid interval (below 15, above 10080) returns 422
- Cross-tenant PATCH returns 404 (tenant isolation)
- Unknown source_id returns 404
- Scheduler update is called when interval changes
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient


# ===========================================================================
# Happy paths
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_source_interval_returns_updated_row(
    client: AsyncClient, user_factory, as_user,
):
    """PATCH with a new interval updates the row and returns 200."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "python remote"}, "fetch_interval_minutes": 1440},
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"fetch_interval_minutes": 360},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == source_id
    assert body["fetch_interval_minutes"] == 360


@pytest.mark.asyncio
async def test_patch_source_name_returns_updated_row(
    client: AsyncClient, user_factory, as_user,
):
    """PATCH with a name updates the label."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "go engineer"}},
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"name": "Go roles"},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Go roles"


# ===========================================================================
# Validation
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_source_empty_body_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """An empty PATCH body (no fields) must be rejected with 422."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        resp = await a.patch(f"/discover/sources/{source_id}", json={})

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_source_interval_below_min_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """Interval < 15 minutes is below the CHECK constraint floor — 422."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"fetch_interval_minutes": 14},
        )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_source_interval_above_max_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """Interval > 10080 minutes (7 days) returns 422."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"fetch_interval_minutes": 10081},
        )

    assert resp.status_code == 422


# ===========================================================================
# Tenant isolation
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_source_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    """Patching another user's source returns 404 — tenant isolation."""
    owner = await user_factory()
    attacker = await user_factory()

    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

    async with await as_user(attacker) as a:
        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"fetch_interval_minutes": 120},
        )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_source_unknown_id_returns_404(
    client: AsyncClient, user_factory, as_user,
):
    """Patching a nonexistent source returns 404."""
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.patch(
            f"/discover/sources/{uuid.uuid4()}",
            json={"fetch_interval_minutes": 120},
        )

    assert resp.status_code == 404


# ===========================================================================
# Scheduler wiring
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_source_calls_update_source_job(
    client: AsyncClient, user_factory, as_user,
):
    """When interval changes, the scheduler's update_source_job should be called."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}, "fetch_interval_minutes": 1440},
        )
        source_id = created.json()["id"]

        with patch(
            "app.services.discovery.discovery_source_service.discovery_scheduler_service.update_source_job",
        ) as mock_update:
            resp = await a.patch(
                f"/discover/sources/{source_id}",
                json={"fetch_interval_minutes": 120},
            )

    assert resp.status_code == 200
    mock_update.assert_called_once()
    call_kwargs = mock_update.call_args.kwargs
    assert call_kwargs["interval_minutes"] == 120
