"""Lineage keys sent by the client, the diff's reorder flag and its step alignment, through the API.

A tweak's ingredients carry ``lineage_key`` from the version it starts from (or null for a new
ingredient), exactly as the web and phone build it (``buildVersionCreateRequest`` in
api-client). Repeated keys, and keys the base version doesn't have, are a 422.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.db.session import unit_of_work
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.repositories.recipe import recipe_version_repository

_RECIPE = {
    "title": "Pancakes",
    "servings": "4",
    "prep_minutes": 5,
    "cook_minutes": 10,
    "ingredients": [
        {"name": "flour", "quantity": 2, "unit": "cup"},
        {"name": "milk", "quantity": 1, "unit": "cup"},
        {"name": "salt", "quantity": 1, "unit": "tsp"},
    ],
    "steps": [{"instruction": "Whisk."}, {"instruction": "Fry."}],
}


def _carried(ingredient: dict) -> dict:
    """An ingredient as the web and phone send it back: the base's values and lineage_key."""
    return {key: ingredient[key] for key in ("name", "quantity", "unit", "note", "lineage_key")}


def _tweak(base: dict, ingredients: list[dict], steps: list[dict] | None = None) -> dict:
    """POST /recipes/{id}/versions's body in the shape the web and phone send."""
    return {
        "base_version_id": base["id"],
        "change_note": "Tweak",
        "servings": base["servings"],
        "prep_minutes": base["prep_minutes"],
        "cook_minutes": base["cook_minutes"],
        "ingredients": ingredients,
        "steps": steps if steps is not None else [{"instruction": s["instruction"]} for s in base["steps"]],
    }


async def _create(authed: AsyncClient) -> tuple[str, dict]:
    resp = await authed.post("/recipes", json=_RECIPE)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["id"], body["latest_version"]


class TestLineageKeysAreChecked:
    @pytest.mark.asyncio
    async def test_a_key_used_twice_in_one_tweak_is_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            flour, milk, _ = v1["ingredients"]
            twice = {**_carried(milk), "lineage_key": flour["lineage_key"]}
            resp = await authed.post(
                f"/recipes/{recipe_id}/versions", json=_tweak(v1, [_carried(flour), twice]),
            )
            versions = (await authed.get(f"/recipes/{recipe_id}/versions")).json()

        assert resp.status_code == 422, resp.text
        assert "used more times than in the version you started from" in resp.json()["detail"]
        assert flour["lineage_key"] not in resp.json()["detail"]
        assert len(versions) == 1

    @pytest.mark.asyncio
    async def test_a_key_the_base_version_lacks_is_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            _, other_v1 = await _create(authed)
            made_up = str(uuid.uuid4())
            unknown = await authed.post(
                f"/recipes/{recipe_id}/versions",
                json=_tweak(v1, [{"name": "egg", "lineage_key": made_up}]),
            )
            # A key from another recipe is just as unknown to this one.
            foreign = await authed.post(
                f"/recipes/{recipe_id}/versions",
                json=_tweak(v1, [_carried(other_v1["ingredients"][0])]),
            )

        assert unknown.status_code == 422, unknown.text
        assert "doesn't belong to the version you started from" in unknown.json()["detail"]
        assert made_up not in unknown.json()["detail"]
        assert foreign.status_code == 422, foreign.text

    @pytest.mark.asyncio
    async def test_a_key_from_a_later_version_is_unknown_to_an_earlier_base(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            v2 = (
                await authed.post(
                    f"/recipes/{recipe_id}/versions",
                    json=_tweak(v1, [*map(_carried, v1["ingredients"]), {"name": "egg", "lineage_key": None}]),
                )
            ).json()
            egg = next(i for i in v2["ingredients"] if i["name"] == "egg")
            resp = await authed.post(f"/recipes/{recipe_id}/versions", json=_tweak(v1, [_carried(egg)]))

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_a_new_recipe_cannot_carry_a_key(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes",
                json={**_RECIPE, "ingredients": [{"name": "flour", "lineage_key": str(uuid.uuid4())}]},
            )
            listed = (await authed.get("/recipes?owner=me")).json()

        assert resp.status_code == 422, resp.text
        assert "can't carry a lineage_key" in resp.json()["detail"]
        assert listed["total"] == 0


class TestValidSavesStillWork:
    @pytest.mark.asyncio
    async def test_web_and_phone_tweak_carrying_keys_with_new_and_removed_rows_saves(
        self, user_factory, as_user,
    ) -> None:
        # Carried rows keep their key, a new row sends null, a dropped row is just left out.
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            flour, milk, salt = v1["ingredients"]
            body = _tweak(
                v1,
                [_carried(salt), {**_carried(flour), "quantity": 3}, {"name": "egg", "quantity": 1,
                 "unit": None, "note": None, "lineage_key": None}],
            )
            resp = await authed.post(f"/recipes/{recipe_id}/versions", json=body)
            assert resp.status_code == 201, resp.text
            v2 = resp.json()
            diff = (await authed.get(f"/recipes/{recipe_id}/versions/{v2['id']}/diff")).json()

        keys = {i["name"]: i["lineage_key"] for i in v2["ingredients"]}
        assert keys["salt"] == salt["lineage_key"]
        assert keys["flour"] == flour["lineage_key"]
        assert keys["egg"] not in {flour["lineage_key"], milk["lineage_key"], salt["lineage_key"]}
        assert sorted((c["change"], (c["after"] or c["before"])["name"]) for c in diff["ingredient_changes"]) == [
            ("added", "egg"), ("changed", "flour"), ("removed", "milk"),
        ]
        assert diff["order_changed"] is True

    @pytest.mark.asyncio
    async def test_a_new_recipe_with_null_keys_saves(self, user_factory, as_user) -> None:
        # The web and phone send lineage_key: null for every row of a new recipe or photo import.
        user = await user_factory()
        async with await as_user(user) as authed:
            payload = {**_RECIPE, "ingredients": [{**i, "note": None, "lineage_key": None} for i in _RECIPE["ingredients"]]}
            resp = await authed.post("/recipes", json=payload)

        assert resp.status_code == 201, resp.text

    @pytest.mark.asyncio
    async def test_restore_then_tweak_from_the_restored_version_saves(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            restored = (await authed.post(f"/recipes/{recipe_id}/versions/{v1['id']}/restore")).json()
            resp = await authed.post(
                f"/recipes/{recipe_id}/versions",
                json=_tweak(restored, list(map(_carried, restored["ingredients"]))),
            )

        assert resp.status_code == 201, resp.text


class TestOlderVersionsAndRepeatedKeys:
    @pytest.mark.asyncio
    async def test_a_tweak_from_an_older_version_can_carry_a_key_a_later_version_dropped(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            flour, milk, salt = v1["ingredients"]
            v2 = await authed.post(
                f"/recipes/{recipe_id}/versions", json=_tweak(v1, [_carried(flour), _carried(salt)]),
            )
            assert v2.status_code == 201, v2.text
            # Back to v1, keeping milk, which v2 dropped.
            v3 = await authed.post(f"/recipes/{recipe_id}/versions", json=_tweak(v1, [_carried(milk)]))

        assert v3.status_code == 201, v3.text
        assert v3.json()["ingredients"][0]["lineage_key"] == milk["lineage_key"]

    @pytest.mark.asyncio
    async def test_a_key_an_older_version_repeats_may_be_carried_as_often_as_it_repeats(
        self, user_factory, as_user,
    ) -> None:
        # Versions saved before keys were checked may repeat one; tweaking from them must still work.
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            salt = v1["ingredients"][2]
            async with unit_of_work() as db:
                await recipe_version_repository.add_ingredients(
                    db,
                    [RecipeIngredient(
                        version_id=uuid.UUID(v1["id"]), lineage_key=uuid.UUID(salt["lineage_key"]),
                        position=4, name="pepper", quantity=1, unit="tsp",
                    )],
                )
            pepper = {**_carried(salt), "name": "pepper"}
            as_often = await authed.post(
                f"/recipes/{recipe_id}/versions", json=_tweak(v1, [_carried(salt), pepper]),
            )
            more_often = await authed.post(
                f"/recipes/{recipe_id}/versions", json=_tweak(v1, [_carried(salt), pepper, pepper]),
            )

        assert as_often.status_code == 201, as_often.text
        assert more_often.status_code == 422, more_often.text
        assert "used more times than in the version you started from" in more_often.json()["detail"]


class TestReorderIsNotIdentical:
    @pytest.mark.asyncio
    async def test_reordering_ingredients_only_reports_order_changed(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            reordered = list(map(_carried, reversed(v1["ingredients"])))
            v2 = (await authed.post(f"/recipes/{recipe_id}/versions", json=_tweak(v1, reordered))).json()
            diff = (await authed.get(f"/recipes/{recipe_id}/versions/{v2['id']}/diff")).json()

        assert diff["field_changes"] == []
        assert diff["ingredient_changes"] == []
        assert diff["step_changes"] == []
        assert diff["order_changed"] is True

    @pytest.mark.asyncio
    async def test_an_unchanged_tweak_is_still_identical(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            same = list(map(_carried, v1["ingredients"]))
            v2 = (await authed.post(f"/recipes/{recipe_id}/versions", json=_tweak(v1, same))).json()
            diff = (await authed.get(f"/recipes/{recipe_id}/versions/{v2['id']}/diff")).json()

        assert diff["field_changes"] == []
        assert diff["ingredient_changes"] == []
        assert diff["step_changes"] == []
        assert diff["order_changed"] is False


class TestStepDiffThroughTheApi:
    @pytest.mark.asyncio
    async def test_inserting_a_step_reports_only_that_step(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id, v1 = await _create(authed)
            steps = [{"instruction": "Rest the batter."}, *({"instruction": s["instruction"]} for s in v1["steps"])]
            same = list(map(_carried, v1["ingredients"]))
            v2 = (await authed.post(f"/recipes/{recipe_id}/versions", json=_tweak(v1, same, steps))).json()
            diff = (await authed.get(f"/recipes/{recipe_id}/versions/{v2['id']}/diff")).json()

        assert diff["step_changes"] == [
            {"position": 1, "change": "added", "before": None, "after": "Rest the batter."},
        ]
        assert diff["order_changed"] is False
