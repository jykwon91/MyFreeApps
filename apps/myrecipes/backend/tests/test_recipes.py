"""Recipe domain tests — recipes, version history (tweaks), diff, cook logs.

Mirrors the MyJobHunter company-writes test style: register a fresh user via
``user_factory``, act through an authed client from ``as_user``, assert
tenant isolation (cross-user access -> 404, no existence leak). Runs against a
real Postgres in CI; the user-delete cascade cleans up all recipe rows.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


def _recipe_payload(**overrides) -> dict:
    payload = {
        "title": "Chocolate Chip Cookies",
        "description": "Weeknight cookies",
        "source": "grandma",
        "servings": "24",
        "prep_minutes": 15,
        "cook_minutes": 11,
        "ingredients": [
            {"name": "flour", "quantity": 2, "unit": "cup"},
            {"name": "salt", "quantity": 1, "unit": "tsp"},
        ],
        "steps": [
            {"instruction": "Cream butter and sugar."},
            {"instruction": "Mix in dry ingredients."},
        ],
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Create + auth
# ---------------------------------------------------------------------------


class TestCreateRecipe:
    @pytest.mark.asyncio
    async def test_create_returns_201_with_v1(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes", json=_recipe_payload())

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["title"] == "Chocolate Chip Cookies"
        assert body["version_count"] == 1
        assert body["latest_version_number"] == 1
        lv = body["latest_version"]
        assert lv["version_number"] == 1
        assert len(lv["ingredients"]) == 2
        assert len(lv["steps"]) == 2
        # Every ingredient is assigned a lineage_key for diffing.
        assert all(i["lineage_key"] for i in lv["ingredients"])

    @pytest.mark.asyncio
    async def test_create_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/recipes", json=_recipe_payload())
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_rejects_extra_user_id(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes", json={**_recipe_payload(), "user_id": user["id"]},
            )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Read + tenant isolation
# ---------------------------------------------------------------------------


class TestReadRecipes:
    @pytest.mark.asyncio
    async def test_list_returns_caller_recipes(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            await authed.post("/recipes", json=_recipe_payload())
            resp = await authed.get("/recipes")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["title"] == "Chocolate Chip Cookies"

    @pytest.mark.asyncio
    async def test_list_does_not_leak_other_users(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed:
            await authed.post("/recipes", json=_recipe_payload())
        async with await as_user(attacker) as authed:
            resp = await authed.get("/recipes")
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_get_other_users_recipe_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed:
            recipe_id = (await authed.post("/recipes", json=_recipe_payload())).json()["id"]
        async with await as_user(attacker) as authed:
            resp = await authed.get(f"/recipes/{recipe_id}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tweak (new version) + diff — the core feature
# ---------------------------------------------------------------------------


class TestTweakAndDiff:
    @pytest.mark.asyncio
    async def test_tweak_creates_v2_and_diff_shows_change(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = (await authed.post("/recipes", json=_recipe_payload())).json()
            recipe_id = created["id"]
            v1 = created["latest_version"]
            salt = next(i for i in v1["ingredients"] if i["name"] == "salt")

            # Tweak: bump salt 1 -> 2 tsp (carry its lineage_key), keep flour,
            # add a step.
            tweak = {
                "change_note": "More salt, longer bake",
                "ingredients": [
                    {"name": "flour", "quantity": 2, "unit": "cup",
                     "lineage_key": next(i["lineage_key"] for i in v1["ingredients"] if i["name"] == "flour")},
                    {"name": "salt", "quantity": 2, "unit": "tsp", "lineage_key": salt["lineage_key"]},
                ],
                "steps": [
                    {"instruction": "Cream butter and sugar."},
                    {"instruction": "Mix in dry ingredients."},
                    {"instruction": "Bake 2 minutes longer."},
                ],
            }
            v2 = (await authed.post(f"/recipes/{recipe_id}/versions", json=tweak)).json()
            assert v2["version_number"] == 2
            assert v2["parent_version_id"] == v1["id"]

            diff = (await authed.get(f"/recipes/{recipe_id}/versions/{v2['id']}/diff")).json()

        assert diff["from_version_number"] == 1
        assert diff["to_version_number"] == 2
        changed = [c for c in diff["ingredient_changes"] if c["change"] == "changed"]
        assert any(
            c["before"]["quantity"] == 1 and c["after"]["quantity"] == 2 for c in changed
        ), diff["ingredient_changes"]
        added_steps = [s for s in diff["step_changes"] if s["change"] == "added"]
        assert any("longer" in (s["after"] or "") for s in added_steps)

    @pytest.mark.asyncio
    async def test_timeline_lists_versions(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = (await authed.post("/recipes", json=_recipe_payload())).json()
            recipe_id = created["id"]
            await authed.post(
                f"/recipes/{recipe_id}/versions",
                json={"change_note": "v2", "ingredients": [], "steps": []},
            )
            timeline = (await authed.get(f"/recipes/{recipe_id}/versions")).json()
        assert [v["version_number"] for v in timeline] == [1, 2]

    @pytest.mark.asyncio
    async def test_restore_copies_version_forward(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = (await authed.post("/recipes", json=_recipe_payload())).json()
            recipe_id = created["id"]
            v1_id = created["latest_version"]["id"]
            # v2 with no ingredients.
            await authed.post(
                f"/recipes/{recipe_id}/versions",
                json={"change_note": "stripped", "ingredients": [], "steps": []},
            )
            # Restore v1 -> becomes v3 with v1's two ingredients.
            restored = (await authed.post(f"/recipes/{recipe_id}/versions/{v1_id}/restore")).json()
        assert restored["version_number"] == 3
        assert len(restored["ingredients"]) == 2


# ---------------------------------------------------------------------------
# Cook logs
# ---------------------------------------------------------------------------


class TestCookLogs:
    @pytest.mark.asyncio
    async def test_log_cook_sets_best_rating(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = (await authed.post("/recipes", json=_recipe_payload())).json()
            recipe_id = created["id"]
            version_id = created["latest_version"]["id"]

            cook = await authed.post(
                f"/recipes/{recipe_id}/versions/{version_id}/cooks",
                json={"rating": 5, "outcome_notes": "Perfect."},
            )
            assert cook.status_code == 201, cook.text

            detail = (await authed.get(f"/recipes/{recipe_id}")).json()
        assert detail["best_rating"] == 5
        assert detail["last_cooked_at"] is not None

    @pytest.mark.asyncio
    async def test_cook_rating_out_of_range_rejected(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = (await authed.post("/recipes", json=_recipe_payload())).json()
            recipe_id = created["id"]
            version_id = created["latest_version"]["id"]
            resp = await authed.post(
                f"/recipes/{recipe_id}/versions/{version_id}/cooks", json={"rating": 9},
            )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------


class TestDeleteRecipe:
    @pytest.mark.asyncio
    async def test_delete_hides_from_list(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id = (await authed.post("/recipes", json=_recipe_payload())).json()["id"]
            assert (await authed.delete(f"/recipes/{recipe_id}")).status_code == 204
            assert (await authed.get(f"/recipes/{recipe_id}")).status_code == 404
            listing = (await authed.get("/recipes")).json()
        assert listing == []
