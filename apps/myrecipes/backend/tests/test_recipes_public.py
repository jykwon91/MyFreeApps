"""Public-read / auth-write behavior for the recipe library.

Mirrors MyGamingAssistant's split: reads are public (anonymous callers can
browse), writes + cook logs require auth. These tests assert the security
contract from the design review:

- Responses NEVER carry ``user_id``; the server computes ``is_owner`` +
  ``owner_display_name`` instead.
- Cook-log rollups (recipe best_rating/last_cooked_at, version
  cook_count/best_rating) are owner-private — null for anyone else.
- ``owner=me`` scopes the list to the authenticated caller (401 anonymously).
- Soft-deleted / missing recipes 404 identically on every public route.
- The public list is paginated (limit honored + capped).

Recipes are committed to the real Postgres (the service commits) and cleaned up
via the user-delete cascade on teardown, so count-sensitive assertions always
scope by a unique title (``search=``) or by ``owner=me``.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient


def _payload(title: str, **overrides: Any) -> dict:
    payload = {
        "title": title,
        "description": "A public recipe",
        "source": "cookbook",
        "servings": "4",
        "prep_minutes": 10,
        "cook_minutes": 20,
        "ingredients": [
            {"name": "flour", "quantity": 2, "unit": "cup"},
            {"name": "salt", "quantity": 1, "unit": "tsp"},
        ],
        "steps": [
            {"instruction": "Mix the dry ingredients."},
            {"instruction": "Bake until golden."},
        ],
    }
    payload.update(overrides)
    return payload


async def _create_recipe(as_user, owner: dict, title: str) -> dict:
    async with await as_user(owner) as authed:
        resp = await authed.post("/recipes", json=_payload(title))
        assert resp.status_code == 201, resp.text
        return resp.json()


def _assert_no_user_id(obj: Any) -> None:
    """Recursively assert ``user_id`` appears nowhere in a response payload."""
    if isinstance(obj, dict):
        assert "user_id" not in obj, f"user_id leaked in keys {list(obj.keys())}"
        for value in obj.values():
            _assert_no_user_id(value)
    elif isinstance(obj, list):
        for item in obj:
            _assert_no_user_id(item)


# ---------------------------------------------------------------------------
# Anonymous reads
# ---------------------------------------------------------------------------


class TestAnonymousRead:
    @pytest.mark.asyncio
    async def test_anon_can_list_no_user_id_rollups_null(
        self, user_factory, as_user, client: AsyncClient,
    ) -> None:
        owner = await user_factory()
        title = f"Anon List {uuid.uuid4().hex[:8]}"
        created = await _create_recipe(as_user, owner, title)

        resp = await client.get("/recipes", params={"search": title})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        row = body[0]
        assert row["id"] == created["id"]
        assert row["is_owner"] is False
        assert row["best_rating"] is None
        assert row["last_cooked_at"] is None
        assert isinstance(row["owner_display_name"], str)
        _assert_no_user_id(body)

    @pytest.mark.asyncio
    async def test_anon_can_read_detail_versions_diff(
        self, user_factory, as_user, client: AsyncClient,
    ) -> None:
        owner = await user_factory()
        title = f"Anon Detail {uuid.uuid4().hex[:8]}"
        created = await _create_recipe(as_user, owner, title)
        rid = created["id"]

        async with await as_user(owner) as authed:
            v2 = (
                await authed.post(
                    f"/recipes/{rid}/versions",
                    json={
                        "change_note": "more flour",
                        "ingredients": [{"name": "flour", "quantity": 3, "unit": "cup"}],
                        "steps": [{"instruction": "Mix the dry ingredients."}],
                    },
                )
            ).json()
        v2_id = v2["id"]

        detail = await client.get(f"/recipes/{rid}")
        assert detail.status_code == 200
        detail_body = detail.json()
        assert detail_body["is_owner"] is False
        assert detail_body["best_rating"] is None
        assert detail_body["last_cooked_at"] is None
        _assert_no_user_id(detail_body)

        versions = await client.get(f"/recipes/{rid}/versions")
        assert versions.status_code == 200
        vbody = versions.json()
        assert [v["version_number"] for v in vbody] == [1, 2]
        assert all(v["cook_count"] is None and v["best_rating"] is None for v in vbody)
        _assert_no_user_id(vbody)

        one = await client.get(f"/recipes/{rid}/versions/{v2_id}")
        assert one.status_code == 200
        _assert_no_user_id(one.json())

        diff = await client.get(f"/recipes/{rid}/versions/{v2_id}/diff")
        assert diff.status_code == 200
        _assert_no_user_id(diff.json())


# ---------------------------------------------------------------------------
# Anonymous writes are blocked
# ---------------------------------------------------------------------------


class TestAnonymousWritesBlocked:
    @pytest.mark.asyncio
    async def test_all_write_and_cook_endpoints_401(
        self, user_factory, as_user, client: AsyncClient,
    ) -> None:
        owner = await user_factory()
        created = await _create_recipe(as_user, owner, f"Guard {uuid.uuid4().hex[:8]}")
        rid = created["id"]
        vid = created["latest_version"]["id"]

        assert (await client.post("/recipes", json=_payload("x"))).status_code == 401
        assert (await client.patch(f"/recipes/{rid}", json={"title": "z"})).status_code == 401
        assert (await client.delete(f"/recipes/{rid}")).status_code == 401
        assert (
            await client.post(
                f"/recipes/{rid}/versions", json={"ingredients": [], "steps": []}
            )
        ).status_code == 401
        assert (
            await client.post(f"/recipes/{rid}/versions/{vid}/restore")
        ).status_code == 401
        assert (
            await client.post(f"/recipes/extract", files={"file": ("x.png", b"x", "image/png")})
        ).status_code == 401
        # Cook logs are private — every /cooks endpoint requires auth.
        assert (
            await client.post(
                f"/recipes/{rid}/versions/{vid}/cooks", json={"rating": 5}
            )
        ).status_code == 401
        assert (
            await client.get(f"/recipes/{rid}/versions/{vid}/cooks")
        ).status_code == 401
        assert (await client.get(f"/recipes/{rid}/cooks")).status_code == 401
        assert (
            await client.delete(f"/recipes/{rid}/cooks/{uuid.uuid4()}")
        ).status_code == 401


# ---------------------------------------------------------------------------
# Logged-in non-owner
# ---------------------------------------------------------------------------


class TestNonOwner:
    @pytest.mark.asyncio
    async def test_non_owner_cannot_mutate_or_read_cooks(
        self, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        created = await _create_recipe(as_user, owner, f"Iso {uuid.uuid4().hex[:8]}")
        rid = created["id"]
        vid = created["latest_version"]["id"]

        async with await as_user(attacker) as authed:
            assert (
                await authed.patch(f"/recipes/{rid}", json={"title": "hax"})
            ).status_code == 404
            assert (await authed.delete(f"/recipes/{rid}")).status_code == 404
            assert (
                await authed.post(
                    f"/recipes/{rid}/versions", json={"ingredients": [], "steps": []}
                )
            ).status_code == 404
            assert (
                await authed.post(f"/recipes/{rid}/versions/{vid}/restore")
            ).status_code == 404
            # Cook logs are owner-only; another user's recipe 404s (no leak).
            assert (await authed.get(f"/recipes/{rid}/cooks")).status_code == 404
            assert (
                await authed.get(f"/recipes/{rid}/versions/{vid}/cooks")
            ).status_code == 404

    @pytest.mark.asyncio
    async def test_non_owner_version_rollups_hidden_even_with_cooks(
        self, user_factory, as_user, client: AsyncClient,
    ) -> None:
        owner = await user_factory()
        created = await _create_recipe(as_user, owner, f"Priv {uuid.uuid4().hex[:8]}")
        rid = created["id"]
        vid = created["latest_version"]["id"]
        async with await as_user(owner) as authed:
            await authed.post(f"/recipes/{rid}/versions/{vid}/cooks", json={"rating": 5})

        # Anonymous / non-owner must never see cook activity.
        versions = (await client.get(f"/recipes/{rid}/versions")).json()
        assert all(v["cook_count"] is None and v["best_rating"] is None for v in versions)
        detail = (await client.get(f"/recipes/{rid}")).json()
        assert detail["best_rating"] is None
        assert detail["last_cooked_at"] is None


# ---------------------------------------------------------------------------
# Owner sees their own rollups
# ---------------------------------------------------------------------------


class TestOwnerRollups:
    @pytest.mark.asyncio
    async def test_owner_sees_populated_rollups(self, user_factory, as_user) -> None:
        owner = await user_factory()
        created = await _create_recipe(as_user, owner, f"Roll {uuid.uuid4().hex[:8]}")
        rid = created["id"]
        vid = created["latest_version"]["id"]

        async with await as_user(owner) as authed:
            await authed.post(f"/recipes/{rid}/versions/{vid}/cooks", json={"rating": 4})
            detail = (await authed.get(f"/recipes/{rid}")).json()
            versions = (await authed.get(f"/recipes/{rid}/versions")).json()
            listed = (await authed.get("/recipes", params={"owner": "me"})).json()

        assert detail["is_owner"] is True
        assert detail["best_rating"] == 4
        assert detail["last_cooked_at"] is not None
        assert versions[0]["cook_count"] == 1
        assert versions[0]["best_rating"] == 4
        mine = next(r for r in listed if r["id"] == rid)
        assert mine["is_owner"] is True
        assert mine["best_rating"] == 4


# ---------------------------------------------------------------------------
# owner=me
# ---------------------------------------------------------------------------


class TestOwnerMeParam:
    @pytest.mark.asyncio
    async def test_owner_me_anonymous_401(self, client: AsyncClient) -> None:
        resp = await client.get("/recipes", params={"owner": "me"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_owner_me_returns_only_own(self, user_factory, as_user) -> None:
        owner = await user_factory()
        other = await user_factory()
        mine_title = f"Mine {uuid.uuid4().hex[:8]}"
        await _create_recipe(as_user, owner, mine_title)
        await _create_recipe(as_user, other, f"Theirs {uuid.uuid4().hex[:8]}")

        async with await as_user(owner) as authed:
            mine = (await authed.get("/recipes", params={"owner": "me"})).json()

        assert len(mine) == 1
        assert mine[0]["title"] == mine_title
        assert mine[0]["is_owner"] is True

    @pytest.mark.asyncio
    async def test_owner_invalid_value_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/recipes", params={"owner": "everyone"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Soft-delete is invisible on every public route
# ---------------------------------------------------------------------------


class TestSoftDeletePublic:
    @pytest.mark.asyncio
    async def test_deleted_recipe_404_on_all_public_routes(
        self, user_factory, as_user, client: AsyncClient,
    ) -> None:
        owner = await user_factory()
        created = await _create_recipe(as_user, owner, f"Del {uuid.uuid4().hex[:8]}")
        rid = created["id"]
        vid = created["latest_version"]["id"]

        async with await as_user(owner) as authed:
            assert (await authed.delete(f"/recipes/{rid}")).status_code == 204

        assert (await client.get(f"/recipes/{rid}")).status_code == 404
        assert (await client.get(f"/recipes/{rid}/versions")).status_code == 404
        assert (await client.get(f"/recipes/{rid}/versions/{vid}")).status_code == 404
        assert (await client.get(f"/recipes/{rid}/versions/{vid}/diff")).status_code == 404

        # Identical body whether soft-deleted or never existed (no leak).
        deleted = await client.get(f"/recipes/{rid}")
        missing = await client.get(f"/recipes/{uuid.uuid4()}")
        assert deleted.json() == missing.json()


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


class TestPagination:
    @pytest.mark.asyncio
    async def test_limit_honored_offset_and_capped(self, user_factory, as_user) -> None:
        owner = await user_factory()
        tag = uuid.uuid4().hex[:8]
        async with await as_user(owner) as authed:
            for i in range(3):
                await authed.post("/recipes", json=_payload(f"Page {tag} {i}"))

            page1 = await authed.get(
                "/recipes",
                params={"owner": "me", "search": f"Page {tag}", "limit": 2},
            )
            assert page1.status_code == 200
            assert len(page1.json()) == 2

            page2 = await authed.get(
                "/recipes",
                params={"owner": "me", "search": f"Page {tag}", "limit": 2, "offset": 2},
            )
            assert len(page2.json()) == 1

            # Over the cap (le=200) and under the floor (ge=1) → 422.
            assert (await authed.get("/recipes", params={"limit": 999})).status_code == 422
            assert (await authed.get("/recipes", params={"limit": 0})).status_code == 422
