"""GET /users/me/export -- includes the user's recipe data, never secrets or other users' rows."""
from __future__ import annotations

import pytest

_RECIPE = {
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
    "steps": [{"instruction": "Cream butter and sugar."}, {"instruction": "Bake."}],
}


async def _create_recipe(authed, **overrides) -> dict:
    resp = await authed.post("/recipes", json={**_RECIPE, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestExportIncludesRecipeData:
    @pytest.mark.asyncio
    async def test_export_has_recipes_versions_ingredients_steps_and_cook_logs(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = await _create_recipe(authed)
            recipe_id = created["id"]
            v1_id = created["latest_version"]["id"]
            tweak = await authed.post(
                f"/recipes/{recipe_id}/versions",
                json={"change_note": "more salt", "ingredients": [
                    {"name": "flour", "quantity": 2, "unit": "cup"},
                    {"name": "salt", "quantity": 2, "unit": "tsp"},
                ], "steps": [{"instruction": "Bake."}]},
            )
            assert tweak.status_code == 201, tweak.text
            cook = await authed.post(
                f"/recipes/{recipe_id}/versions/{v1_id}/cooks",
                json={"rating": 4, "outcome_notes": "A bit bland."},
            )
            assert cook.status_code == 201, cook.text

            resp = await authed.get("/users/me/export")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["recipes"]) == 1
        recipe = body["recipes"][0]
        assert recipe["title"] == "Chocolate Chip Cookies"
        assert recipe["source"] == "grandma"
        assert [v["version_number"] for v in recipe["versions"]] == [1, 2]
        v1, v2 = recipe["versions"]
        assert [i["name"] for i in v1["ingredients"]] == ["flour", "salt"]
        assert v1["ingredients"][0]["quantity"] == 2.0
        assert [s["instruction"] for s in v1["steps"]] == ["Cream butter and sugar.", "Bake."]
        assert v2["change_note"] == "more salt"
        assert v2["ingredients"][1]["quantity"] == 2.0
        assert v2["parent_version_id"] == v1["id"]
        assert len(body["cook_logs"]) == 1
        assert body["cook_logs"][0]["version_id"] == v1_id
        assert body["cook_logs"][0]["rating"] == 4
        assert body["cook_logs"][0]["outcome_notes"] == "A bit bland."

    @pytest.mark.asyncio
    async def test_export_excludes_other_users_data(self, user_factory, as_user) -> None:
        owner = await user_factory()
        other = await user_factory()
        async with await as_user(other) as other_client:
            theirs = await _create_recipe(other_client, title="Secret Sauce")
            await other_client.post(
                f"/recipes/{theirs['id']}/versions/{theirs['latest_version']['id']}/cooks",
                json={"rating": 5, "outcome_notes": "their private note"},
            )
        async with await as_user(owner) as authed:
            await _create_recipe(authed, title="Mine")
            resp = await authed.get("/users/me/export")

        body = resp.json()
        assert [r["title"] for r in body["recipes"]] == ["Mine"]
        assert body["cook_logs"] == []
        assert "Secret Sauce" not in resp.text
        assert "their private note" not in resp.text

    @pytest.mark.asyncio
    async def test_export_omits_soft_deleted_recipes(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            gone = await _create_recipe(authed, title="Deleted One")
            await authed.post(
                f"/recipes/{gone['id']}/versions/{gone['latest_version']['id']}/cooks",
                json={"rating": 3, "outcome_notes": "deleted cook"},
            )
            await _create_recipe(authed, title="Kept One")
            assert (await authed.delete(f"/recipes/{gone['id']}")).status_code == 204
            resp = await authed.get("/users/me/export")

        body = resp.json()
        assert [r["title"] for r in body["recipes"]] == ["Kept One"]
        assert body["cook_logs"] == []

    @pytest.mark.asyncio
    async def test_export_never_contains_secrets(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/users/me/export")

        body = resp.json()
        assert body["recipes"] == [] and body["cook_logs"] == []
        assert set(body["user"]) == {"id", "email", "display_name", "is_verified", "totp_enabled"}
        lowered = resp.text.lower()
        for secret_key in ("hashed_password", "totp_secret", "recovery", "token"):
            assert secret_key not in lowered
