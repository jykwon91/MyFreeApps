"""Out-of-range model numbers become null in both draft extraction paths."""
import math

import pytest

from app.schemas.recipe.version_schemas import INGREDIENT_QUANTITY_MAX, RECIPE_MINUTES_MAX
from app.services.recipe import discovery_service as ds
from app.services.recipe import photo_extraction_service as pes
from app.services.recipe.draft_value_coercion import coerce_minutes, coerce_quantity


class TestCoerceQuantity:
    @pytest.mark.parametrize(
        "value",
        [math.inf, -math.inf, math.nan, "inf", "nan", "Infinity", INGREDIENT_QUANTITY_MAX * 2, "1e30", 10**400, "10000000"],
    )
    def test_non_finite_or_over_max_becomes_none(self, value: object) -> None:
        assert coerce_quantity(value) is None

    @pytest.mark.parametrize(
        ("value", "expected"),
        [(2, 2.0), (1.5, 1.5), ("1/2", 0.5), ("1 3/4", 1.75), (0, 0.0), (INGREDIENT_QUANTITY_MAX, INGREDIENT_QUANTITY_MAX)],
    )
    def test_normal_values_unchanged(self, value: object, expected: float) -> None:
        assert coerce_quantity(value) == expected

    def test_logs_count_never_the_value(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level("WARNING"):
            coerce_quantity("123456789012")
        assert "kind=quantity" in caplog.text
        assert "123456789012" not in caplog.text


class TestCoerceMinutes:
    @pytest.mark.parametrize("value", [math.inf, math.nan, RECIPE_MINUTES_MAX + 1, 10**20, "99999999999 min"])
    def test_non_finite_or_over_max_becomes_none(self, value: object) -> None:
        assert coerce_minutes(value) is None

    def test_normal_values_unchanged(self) -> None:
        assert coerce_minutes(30) == 30
        assert coerce_minutes("20 minutes") == 20
        assert coerce_minutes(RECIPE_MINUTES_MAX) == RECIPE_MINUTES_MAX

    def test_caller_supplied_maximum(self) -> None:
        assert coerce_minutes(4320, 4320) == 4320
        assert coerce_minutes(4321, 4320) is None


class TestBothPathsShareTheCoercer:
    def test_photo_draft_nulls_bad_numbers(self) -> None:
        draft = pes._coerce_draft(
            {
                "title": "Stew",
                "prep_minutes": 10**20,
                "cook_minutes": 45,
                "ingredients": [
                    {"name": "a", "quantity": math.inf},
                    {"name": "b", "quantity": 1e12},
                    {"name": "c", "quantity": "1/2"},
                ],
            }
        )
        assert draft.prep_minutes is None
        assert draft.cook_minutes == 45
        assert [i.quantity for i in draft.ingredients] == [None, None, 0.5]
        draft.model_dump_json()  # inf would break JSON encoding

    def test_discovery_draft_nulls_bad_numbers(self) -> None:
        draft = ds._coerce_draft(
            {
                "title": "Stew",
                "prep_minutes": math.inf,
                "cook_minutes": 45,
                "ingredients": [
                    {"name": "a", "quantity": math.inf},
                    {"name": "b", "quantity": 1e12},
                    {"name": "c", "quantity": 2},
                ],
            },
            fallback_title="x",
        )
        assert draft.prep_minutes is None
        assert draft.cook_minutes == 45
        assert [i.quantity for i in draft.ingredients] == [None, None, 2.0]
