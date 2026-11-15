"""The backend refuses what the web and phone forms refuse, with a 422 (never a 500).

A blank title, a tweak without a note, and a recipe or tweak with no
ingredients or steps are all rejected; an explicit null title on PATCH is too
(the column is NOT NULL). Whitespace is stripped before it is checked and stored.
"""
from __future__ import annotations

import pytest

CONTENT = {"ingredients": [{"name": "flour"}], "steps": [{"instruction": "Mix."}]}


def _recipe(**overrides) -> dict:
    return {"title": "Pancakes", **CONTENT, **overrides}


def _tweak(**overrides) -> dict:
    return {"change_note": "More flour", **CONTENT, **overrides}


class TestCreate:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("title", ["", "   ", None])
    async def test_blank_or_null_title_is_422(self, user_factory, as_user, title) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes", json=_recipe(title=title))
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    @pytest.mark.parametrize("field", ["ingredients", "steps"])
    async def test_empty_ingredients_or_steps_is_422(self, user_factory, as_user, field) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes", json=_recipe(**{field: []}))
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_blank_ingredient_name_or_step_is_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            blank_name = await authed.post("/recipes", json=_recipe(ingredients=[{"name": "  "}]))
            blank_step = await authed.post("/recipes", json=_recipe(steps=[{"instruction": " "}]))
        assert blank_name.status_code == 422
        assert blank_step.status_code == 422

    @pytest.mark.asyncio
    async def test_title_is_stored_trimmed(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes", json=_recipe(title="  Pancakes  "))
        assert resp.status_code == 201, resp.text
        assert resp.json()["title"] == "Pancakes"


class TestUpdate:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("title", ["", "   ", None])
    async def test_blank_or_null_title_is_422_and_title_is_kept(self, user_factory, as_user, title) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe())).json()["id"]
            resp = await authed.patch(f"/recipes/{rid}", json={"title": title})
            kept = (await authed.get(f"/recipes/{rid}")).json()["title"]
        assert resp.status_code == 422, resp.text
        assert kept == "Pancakes"

    @pytest.mark.asyncio
    async def test_title_is_stored_trimmed(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe())).json()["id"]
            resp = await authed.patch(f"/recipes/{rid}", json={"title": "  Crepes "})
        assert resp.status_code == 200, resp.text
        assert resp.json()["title"] == "Crepes"

    @pytest.mark.asyncio
    async def test_omitting_title_still_works_and_null_description_clears(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe(description="x"))).json()["id"]
            resp = await authed.patch(f"/recipes/{rid}", json={"description": None})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "Pancakes"
        assert body["description"] is None


class TestTweak:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("note", ["", "   ", None])
    async def test_blank_or_null_change_note_is_422(self, user_factory, as_user, note) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe())).json()["id"]
            resp = await authed.post(f"/recipes/{rid}/versions", json=_tweak(change_note=note))
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_missing_change_note_is_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe())).json()["id"]
            resp = await authed.post(f"/recipes/{rid}/versions", json=dict(CONTENT))
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    @pytest.mark.parametrize("field", ["ingredients", "steps"])
    async def test_empty_ingredients_or_steps_is_422(self, user_factory, as_user, field) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe())).json()["id"]
            resp = await authed.post(f"/recipes/{rid}/versions", json=_tweak(**{field: []}))
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_valid_tweak_saves_with_trimmed_note(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            rid = (await authed.post("/recipes", json=_recipe())).json()["id"]
            resp = await authed.post(f"/recipes/{rid}/versions", json=_tweak(change_note="  Less salt "))
        assert resp.status_code == 201, resp.text
        assert resp.json()["change_note"] == "Less salt"
