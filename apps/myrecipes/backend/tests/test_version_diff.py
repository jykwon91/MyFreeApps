"""Pure diff-engine tests: per-version fields (servings, prep/cook minutes).

No database: versions are built in memory, since ``version_diff`` only reads
attributes off already-loaded rows.
"""
from __future__ import annotations

import uuid

from app.models.recipe.recipe_version import RecipeVersion
from app.services.recipe.version_diff import diff_fields


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
