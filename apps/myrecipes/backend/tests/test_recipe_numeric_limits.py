"""Numeric inputs are bounded by their columns, so oversize values are a 422.

``recipe_ingredient.quantity`` is Numeric(10, 3) and the minutes are Integer.
Without the schema bounds these passed validation and overflowed in Postgres
(a 500). Extra decimals are not an error: Postgres rounds them to the scale.
"""
from __future__ import annotations

import pytest

from app.schemas.recipe.version_schemas import INGREDIENT_QUANTITY_MAX, RECIPE_MINUTES_MAX


def _payload(*, quantity: float | None = 1, prep: int | None = 10, cook: int | None = 20) -> dict:
    return {
        "title": "Big batch",
        "prep_minutes": prep,
        "cook_minutes": cook,
        "ingredients": [{"name": "flour", "quantity": quantity, "unit": "g"}],
        "steps": [{"instruction": "Mix."}],
    }


def _tweak(*, quantity: float | None = 1, prep: int | None = 10, cook: int | None = 20) -> dict:
    body = _payload(quantity=quantity, prep=prep, cook=cook)
    del body["title"]
    return {**body, "change_note": "Scaled up"}


class TestNumericLimits:
    @pytest.mark.asyncio
    async def test_the_largest_values_the_columns_hold_save(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes",
                json=_payload(quantity=INGREDIENT_QUANTITY_MAX, prep=RECIPE_MINUTES_MAX, cook=RECIPE_MINUTES_MAX),
            )
        assert resp.status_code == 201, resp.text
        version = resp.json()["latest_version"]
        assert version["ingredients"][0]["quantity"] == pytest.approx(INGREDIENT_QUANTITY_MAX)
        assert version["prep_minutes"] == RECIPE_MINUTES_MAX
        assert version["cook_minutes"] == RECIPE_MINUTES_MAX

    @pytest.mark.asyncio
    async def test_extra_decimals_are_rounded_to_the_column_scale(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes", json=_payload(quantity=0.12345))
        assert resp.status_code == 201, resp.text
        assert resp.json()["latest_version"]["ingredients"][0]["quantity"] == pytest.approx(0.123)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("field", "overrides"),
        [
            ("quantity", {"quantity": 10_000_000}),
            ("quantity", {"quantity": 9_999_999.9995}),
            ("prep_minutes", {"prep": RECIPE_MINUTES_MAX + 1}),
            ("cook_minutes", {"cook": RECIPE_MINUTES_MAX + 1}),
        ],
    )
    async def test_create_refuses_more_than_the_columns_hold(self, user_factory, as_user, field, overrides) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes", json=_payload(**overrides))
        assert resp.status_code == 422, resp.text
        assert any(error["loc"][-1] == field for error in resp.json()["detail"]), resp.text

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("field", "overrides"),
        [
            ("quantity", {"quantity": 10_000_000}),
            ("prep_minutes", {"prep": RECIPE_MINUTES_MAX + 1}),
            ("cook_minutes", {"cook": RECIPE_MINUTES_MAX + 1}),
        ],
    )
    async def test_tweak_refuses_more_than_the_columns_hold(self, user_factory, as_user, field, overrides) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            recipe_id = (await authed.post("/recipes", json=_payload())).json()["id"]
            resp = await authed.post(f"/recipes/{recipe_id}/versions", json=_tweak(**overrides))
            versions = (await authed.get(f"/recipes/{recipe_id}/versions")).json()
        assert resp.status_code == 422, resp.text
        assert any(error["loc"][-1] == field for error in resp.json()["detail"]), resp.text
        assert len(versions) == 1
