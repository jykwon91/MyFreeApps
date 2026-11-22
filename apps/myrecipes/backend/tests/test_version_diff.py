"""Pure diff-engine tests: per-version fields, ingredients with repeated keys, reorders.

No database: versions are built in memory, since ``version_diff`` only reads
attributes off already-loaded rows.
"""
from __future__ import annotations

import uuid

from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion
from app.services.recipe.version_diff import diff_fields, diff_ingredients, order_changed


def _version(
    *, servings: str | None = "4", prep_minutes: int | None = 10, cook_minutes: int | None = 30,
) -> RecipeVersion:
    return RecipeVersion(
        recipe_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        version_number=1,
        servings=servings,
        prep_minutes=prep_minutes,
        cook_minutes=cook_minutes,
    )


class TestDiffFields:
    def test_unchanged_fields_give_no_changes(self) -> None:
        assert diff_fields(_version(), _version()) == []

    def test_servings_and_cook_time_changes_are_reported_in_field_order(self) -> None:
        changes = diff_fields(_version(), _version(servings="8", cook_minutes=45))
        assert [(c.field, c.before, c.after) for c in changes] == [
            ("servings", "4", "8"),
            ("cook_minutes", 30, 45),
        ]

    def test_cleared_and_newly_set_fields_are_changes(self) -> None:
        changes = diff_fields(
            _version(prep_minutes=None, cook_minutes=30),
            _version(prep_minutes=5, cook_minutes=None),
        )
        assert [(c.field, c.before, c.after) for c in changes] == [
            ("prep_minutes", None, 5),
            ("cook_minutes", 30, None),
        ]

    def test_zero_minutes_differs_from_empty(self) -> None:
        changes = diff_fields(_version(prep_minutes=None), _version(prep_minutes=0))
        assert [(c.field, c.before, c.after) for c in changes] == [("prep_minutes", None, 0)]

    def test_first_version_reports_every_set_field_as_from_empty(self) -> None:
        changes = diff_fields(None, _version(prep_minutes=None))
        assert [(c.field, c.before, c.after) for c in changes] == [
            ("servings", None, "4"),
            ("cook_minutes", None, 30),
        ]


def _ing(key: uuid.UUID, name: str, position: int, quantity: float | None = 1) -> RecipeIngredient:
    return RecipeIngredient(
        version_id=uuid.uuid4(), lineage_key=key, position=position, name=name, quantity=quantity,
    )


def _steps(*instructions: str) -> list[RecipeStep]:
    return [
        RecipeStep(version_id=uuid.uuid4(), position=i, instruction=text)
        for i, text in enumerate(instructions, start=1)
    ]


class TestDiffIngredientsWithRepeatedKeys:
    """Versions saved before keys were checked may repeat a key; no row may vanish from the diff."""

    def test_a_key_repeated_in_the_new_version_shows_the_extra_row_as_added(self) -> None:
        key = uuid.uuid4()
        changes = diff_ingredients([_ing(key, "salt", 1)], [_ing(key, "salt", 1), _ing(key, "pepper", 2)])
        assert [(c.change, c.after.name if c.after else None) for c in changes] == [("added", "pepper")]

    def test_a_key_repeated_in_the_old_version_shows_the_dropped_row_as_removed(self) -> None:
        key = uuid.uuid4()
        changes = diff_ingredients([_ing(key, "salt", 1), _ing(key, "pepper", 2)], [_ing(key, "salt", 1)])
        assert [(c.change, c.before.name if c.before else None) for c in changes] == [("removed", "pepper")]

    def test_rows_sharing_a_key_on_both_sides_are_matched_in_order(self) -> None:
        key = uuid.uuid4()
        changes = diff_ingredients(
            [_ing(key, "salt", 1), _ing(key, "pepper", 2)],
            [_ing(key, "salt", 1), _ing(key, "pepper", 2, quantity=2)],
        )
        assert [(c.change, c.before.quantity, c.after.quantity) for c in changes if c.before and c.after] == [
            ("changed", 1, 2),
        ]


class TestOrderChanged:
    def test_same_ingredients_in_another_order(self) -> None:
        a, b = uuid.uuid4(), uuid.uuid4()
        before = [_ing(a, "flour", 1), _ing(b, "salt", 2)]
        after = [_ing(b, "salt", 1), _ing(a, "flour", 2)]
        assert diff_ingredients(before, after) == []
        assert order_changed(before, after, _steps("Mix."), _steps("Mix.")) is True

    def test_same_order_is_not_a_reorder(self) -> None:
        a, b = uuid.uuid4(), uuid.uuid4()
        before = [_ing(a, "flour", 1), _ing(b, "salt", 2)]
        after = [_ing(a, "flour", 1), _ing(b, "salt", 2)]
        assert order_changed(before, after, _steps("Mix.", "Bake."), _steps("Mix.", "Bake.")) is False

    def test_adding_or_removing_rows_alone_is_not_a_reorder(self) -> None:
        a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        before = [_ing(a, "flour", 1), _ing(b, "salt", 2)]
        after = [_ing(c, "egg", 1), _ing(a, "flour", 2)]
        assert order_changed(before, after, _steps("Mix."), _steps("Mix.", "Bake.")) is False

    def test_same_steps_in_another_order(self) -> None:
        assert order_changed([], [], _steps("Mix.", "Bake."), _steps("Bake.", "Mix.")) is True

    def test_different_steps_are_not_a_reorder(self) -> None:
        assert order_changed([], [], _steps("Mix.", "Bake."), _steps("Bake.", "Rest.")) is False
