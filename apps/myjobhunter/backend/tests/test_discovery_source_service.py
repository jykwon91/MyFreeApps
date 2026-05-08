"""Unit tests for discovery_source_service and discovery_inbox_service.

Exercises the transaction boundary (service commits, repo flushes only).
Uses the HTTP client fixtures so the DB session lifecycle is exercised
end-to-end — the same pattern used in test_discover_endpoints.py.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


# ===========================================================================
# discovery_source_service
# ===========================================================================


@pytest.mark.asyncio
async def test_create_source_persists(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "python remote"}},
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["source"] == "jsearch"
    assert body["is_active"] is True
    assert uuid.UUID(body["id"])


@pytest.mark.asyncio
async def test_create_source_default_fetch_interval(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "go engineer"}},
        )
    assert resp.status_code == 201
    assert resp.json()["fetch_interval_minutes"] == 1440


@pytest.mark.asyncio
async def test_deactivate_source_returns_204(
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


@pytest.mark.asyncio
async def test_deactivate_source_not_found_returns_404(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.delete(f"/discover/sources/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_deactivate_source_cross_tenant_404(
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
# discovery_inbox_service
# ===========================================================================


@pytest.mark.asyncio
async def test_dismiss_not_found_returns_404(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{uuid.uuid4()}/dismiss")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_save_not_found_returns_404(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{uuid.uuid4()}/save")
    assert resp.status_code == 404
