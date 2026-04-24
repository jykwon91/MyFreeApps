"""Tenant isolation: user A cannot see user B's data across all smoke endpoints.

Phase 1: both users have no data, so both see empty responses.
Phase 2 will add: user A creates data, user B still cannot see it.

Note on paths: the FastAPI app is mounted with root_path="/api" for production
(Caddy strips the /api prefix before forwarding). In tests the client calls
paths WITHOUT the /api prefix — they hit the app directly at the registered
route paths.
"""
import uuid

import pytest
from httpx import AsyncClient


SMOKE_ENDPOINTS = [
    ("/profile", "profile"),
    ("/applications", "items"),
    ("/companies", "items"),
    ("/integrations", "items"),
]


@pytest.mark.asyncio
async def test_unauthenticated_requests_rejected(client: AsyncClient) -> None:
    """All protected endpoints return 401 without a bearer token."""
    for endpoint, _ in SMOKE_ENDPOINTS:
        resp = await client.get(endpoint)
        assert resp.status_code == 401, f"{endpoint} should require auth"


@pytest.mark.asyncio
async def test_user_a_sees_empty_profile(client: AsyncClient, user_factory, as_user) -> None:
    user_a = await user_factory()
    async with await as_user(user_a) as authed_a:
        resp = await authed_a.get("/profile")
    assert resp.status_code == 200
    assert resp.json()["profile"] is None


@pytest.mark.asyncio
async def test_user_a_sees_empty_applications(client: AsyncClient, user_factory, as_user) -> None:
    user_a = await user_factory()
    async with await as_user(user_a) as authed_a:
        resp = await authed_a.get("/applications")
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_user_a_sees_empty_companies(client: AsyncClient, user_factory, as_user) -> None:
    user_a = await user_factory()
    async with await as_user(user_a) as authed_a:
        resp = await authed_a.get("/companies")
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_user_a_sees_empty_integrations(client: AsyncClient, user_factory, as_user) -> None:
    user_a = await user_factory()
    async with await as_user(user_a) as authed_a:
        resp = await authed_a.get("/integrations")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_company_research_404_for_unknown(client: AsyncClient, user_factory, as_user) -> None:
    user_a = await user_factory()
    nonexistent_id = str(uuid.uuid4())
    async with await as_user(user_a) as authed_a:
        resp = await authed_a.get(f"/companies/{nonexistent_id}/research")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_two_users_both_see_empty_data(
    client: AsyncClient, user_factory, as_user
) -> None:
    """User A and User B both see empty data — foundation for Phase 2 isolation tests."""
    user_a = await user_factory()
    user_b = await user_factory()

    async with await as_user(user_a) as authed_a:
        resp_a_apps = await authed_a.get("/applications")
        resp_a_companies = await authed_a.get("/companies")

    async with await as_user(user_b) as authed_b:
        resp_b_apps = await authed_b.get("/applications")
        resp_b_companies = await authed_b.get("/companies")

    assert resp_a_apps.json()["items"] == []
    assert resp_b_apps.json()["items"] == []
    assert resp_a_companies.json()["items"] == []
    assert resp_b_companies.json()["items"] == []
