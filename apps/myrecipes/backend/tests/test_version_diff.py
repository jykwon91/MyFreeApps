"""Pure diff-engine tests: per-version fields, ingredients with repeated keys, step alignment, reorders.

No database: versions are built in memory, since ``version_diff`` only reads
attributes off already-loaded rows.
"""
from __future__ import annotations

import uuid

from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion
from app.services.recipe.version_diff import (
    diff_fields,
    diff_ingredients,
    diff_steps,
    order_changed,
)


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

    def test_inserting_a_step_is_not_a_reorder(self) -> None:
        assert order_changed([], [], _steps("Mix.", "Bake."), _steps("Mix.", "Rest.", "Bake.")) is False

    def test_a_step_moved_alongside_an_edit_is_a_reorder(self) -> None:
        before = _steps("Chop.", "Heat the oil.", "Fry.")
        after = _steps("Heat the oil.", "Chop.", "Fry for 5 minutes.")
        assert order_changed([], [], before, after) is True

    def test_dropping_one_of_two_identical_steps_is_not_a_reorder(self) -> None:
        assert order_changed([], [], _steps("Stir.", "Add stock.", "Stir."), _steps("Stir.", "Add stock.")) is False


def _step_rows(before: list[RecipeStep], after: list[RecipeStep]) -> list[tuple[str, int, str | None, str | None]]:
    return [(c.change, c.position, c.before, c.after) for c in diff_steps(before, after)]


class TestDiffSteps:
    """Steps have no lineage key: they're aligned by text, so one insert or removal is one change."""

    def test_identical_steps_have_no_changes(self) -> None:
        assert diff_steps(_steps("Mix.", "Bake."), _steps("Mix.", "Bake.")) == []

    def test_inserting_a_step_is_one_added_step_not_a_change_to_every_later_step(self) -> None:
        before = _steps("Preheat the oven.", "Mix the batter.", "Pour into a tin.", "Bake 30 minutes.")
        after = _steps(
            "Preheat the oven.", "Grease the tin.", "Mix the batter.", "Pour into a tin.", "Bake 30 minutes.",
        )
        assert _step_rows(before, after) == [("added", 2, None, "Grease the tin.")]

    def test_removing_a_step_is_one_removed_step_at_its_old_position(self) -> None:
        before = _steps("Preheat the oven.", "Grease the tin.", "Mix the batter.", "Bake 30 minutes.")
        after = _steps("Preheat the oven.", "Mix the batter.", "Bake 30 minutes.")
        assert _step_rows(before, after) == [("removed", 2, "Grease the tin.", None)]

    def test_editing_a_step_is_one_changed_step(self) -> None:
        before = _steps("Preheat the oven.", "Bake for 30 minutes until golden.", "Cool.")
        after = _steps("Preheat the oven.", "Bake for 35 minutes until golden.", "Cool.")
        assert _step_rows(before, after) == [
            ("changed", 2, "Bake for 30 minutes until golden.", "Bake for 35 minutes until golden."),
        ]

    def test_an_insert_next_to_an_edit_pairs_the_edit_with_its_old_wording(self) -> None:
        before = _steps("Preheat the oven.", "Bake for 30 minutes until golden.")
        after = _steps("Preheat the oven.", "Brush with egg wash.", "Bake for 35 minutes until golden.")
        assert _step_rows(before, after) == [
            ("added", 2, None, "Brush with egg wash."),
            ("changed", 3, "Bake for 30 minutes until golden.", "Bake for 35 minutes until golden."),
        ]

    def test_a_spacing_or_case_only_edit_is_still_reported_as_changed(self) -> None:
        assert _step_rows(_steps("Mix.", "bake  well."), _steps("Mix.", "Bake well.")) == [
            ("changed", 2, "bake  well.", "Bake well."),
        ]

    def test_repeating_identical_steps_shows_only_the_extra_copies_as_added(self) -> None:
        # Either copy can be "the new one"; what matters is that only the two extra
        # steps show, as added, and the matching originals stay unchanged.
        before = _steps("Stir.", "Rest 5 minutes.", "Serve.")
        after = _steps("Stir.", "Rest 5 minutes.", "Stir.", "Rest 5 minutes.", "Serve.")
        assert [(c.change, c.after) for c in diff_steps(before, after)] == [
            ("added", "Stir."),
            ("added", "Rest 5 minutes."),
        ]

    def test_removing_one_of_two_identical_steps_removes_just_that_one(self) -> None:
        before = _steps("Stir.", "Add stock.", "Stir.", "Serve.")
        after = _steps("Stir.", "Add stock.", "Serve.")
        assert _step_rows(before, after) == [("removed", 3, "Stir.", None)]

    def test_a_moved_and_edited_step_shows_the_move_and_the_edit(self) -> None:
        before = _steps("Chop the onions.", "Heat the oil.", "Fry the onions for 5 minutes.")
        after = _steps("Heat the oil.", "Chop the onions finely.", "Fry the onions for 5 minutes.")
        assert _step_rows(before, after) == [
            ("removed", 1, "Chop the onions.", None),
            ("added", 2, None, "Chop the onions finely."),
        ]

    def test_an_empty_base_reports_every_step_as_added(self) -> None:
        assert _step_rows([], _steps("Mix.", "Bake.")) == [
            ("added", 1, None, "Mix."),
            ("added", 2, None, "Bake."),
        ]

    def test_an_entirely_replaced_list_is_removed_then_added(self) -> None:
        before = _steps("Boil the pasta.", "Drain it.")
        after = _steps("Toast the bread.", "Spread butter on top.", "Serve warm.")
        assert _step_rows(before, after) == [
            ("removed", 1, "Boil the pasta.", None),
            ("removed", 2, "Drain it.", None),
            ("added", 1, None, "Toast the bread."),
            ("added", 2, None, "Spread butter on top."),
            ("added", 3, None, "Serve warm."),
        ]

    def test_a_reworded_list_of_the_same_length_is_changed_step_by_step(self) -> None:
        before = _steps("Boil the pasta for 8 minutes.", "Drain the pasta well.")
        after = _steps("Boil the pasta for 10 minutes.", "Drain the pasta and toss with oil.")
        assert [c.change for c in diff_steps(before, after)] == ["changed", "changed"]

    def test_a_full_recipe_of_steps_aligns_quickly(self) -> None:
        before = _steps(*(f"Step {i} stir the pot and season to taste." for i in range(200)))
        after = _steps(*(f"Stage {i} whisk the bowl and season to taste." for i in range(200)))
        assert len(diff_steps(before, after)) == 200
