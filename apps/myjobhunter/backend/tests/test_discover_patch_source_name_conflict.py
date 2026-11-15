"""PATCH /discover/sources/{id} — name/kind conflicts return 409, not 500.

The partial unique index ``uq_discovery_source_user_kind_name`` covers only
active rows, so a PATCH that would leave two active rows of the same kind
with the same name must be rejected with the same 409 as create.
"""
from __future__ import annotations

from httpx import AsyncClient


async def _create(a: AsyncClient, name: str, source: str = "jsearch") -> str:
    config = {"query": "python"} if source == "jsearch" else {"board_token": "acme"}
    resp = await a.post("/discover/sources", json={"source": source, "name": name, "config": config})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_rename_to_active_duplicate_returns_409(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as a:
        await _create(a, "Remote")
        other = await _create(a, "Onsite")
        resp = await a.patch(f"/discover/sources/{other}", json={"name": "Remote"})
        assert resp.status_code == 409, resp.text
        assert "Remote" in resp.json()["detail"]
        unchanged = await a.get("/discover/sources")
        assert sorted(s["name"] for s in unchanged.json()) == ["Onsite", "Remote"]


async def test_reactivate_into_active_duplicate_returns_409(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as a:
        old = await _create(a, "Remote")
        assert (await a.delete(f"/discover/sources/{old}")).status_code == 204
        await _create(a, "Remote")
        resp = await a.patch(f"/discover/sources/{old}", json={"is_active": True})
        assert resp.status_code == 409, resp.text


async def test_rename_to_own_name_is_allowed(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create(a, "Remote")
        resp = await a.patch(f"/discover/sources/{source_id}", json={"name": "Remote", "fetch_interval_minutes": 360})
        assert resp.status_code == 200, resp.text


async def test_rename_to_name_of_inactive_row_is_allowed(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as a:
        gone = await _create(a, "Remote")
        assert (await a.delete(f"/discover/sources/{gone}")).status_code == 204
        live = await _create(a, "Onsite")
        resp = await a.patch(f"/discover/sources/{live}", json={"name": "Remote"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Remote"


async def test_same_name_on_different_kind_is_allowed(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as a:
        await _create(a, "Remote", "greenhouse")
        live = await _create(a, "Onsite")
        resp = await a.patch(f"/discover/sources/{live}", json={"name": "Remote"})
        assert resp.status_code == 200, resp.text
