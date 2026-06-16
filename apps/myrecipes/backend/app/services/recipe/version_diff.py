"""Pure diff engine — what changed between two version snapshots.

No DB access: it takes already-loaded ingredient/step rows. Ingredients are
matched by ``lineage_key`` (stable across versions, so a quantity edit reads
as a *change* not remove+add); steps are matched by ``position``.
"""
from __future__ import annotations

from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.schemas.recipe.diff_schemas import (
    IngredientChange,
    IngredientSnapshot,
    StepChange,
)


def _snapshot(ing: RecipeIngredient) -> IngredientSnapshot:
    return IngredientSnapshot(
        name=ing.name,
        quantity=float(ing.quantity) if ing.quantity is not None else None,
        unit=ing.unit,
        note=ing.note,
    )


def _ingredient_equal(a: RecipeIngredient, b: RecipeIngredient) -> bool:
    qa = float(a.quantity) if a.quantity is not None else None
    qb = float(b.quantity) if b.quantity is not None else None
    return a.name == b.name and qa == qb and a.unit == b.unit and a.note == b.note


def diff_ingredients(
    before: list[RecipeIngredient], after: list[RecipeIngredient],
) -> list[IngredientChange]:
    before_by_key = {i.lineage_key: i for i in before}
    after_by_key = {i.lineage_key: i for i in after}

    changes: list[IngredientChange] = []
    # Added + changed (iterate the new version so added items keep their order).
    for key, new_ing in after_by_key.items():
        old_ing = before_by_key.get(key)
        if old_ing is None:
            changes.append(
                IngredientChange(lineage_key=key, change="added", after=_snapshot(new_ing))
            )
        elif not _ingredient_equal(old_ing, new_ing):
            changes.append(
                IngredientChange(
                    lineage_key=key,
                    change="changed",
                    before=_snapshot(old_ing),
                    after=_snapshot(new_ing),
                )
            )
    # Removed.
    for key, old_ing in before_by_key.items():
        if key not in after_by_key:
            changes.append(
                IngredientChange(lineage_key=key, change="removed", before=_snapshot(old_ing))
            )
    return changes


def diff_steps(
    before: list[RecipeStep], after: list[RecipeStep],
) -> list[StepChange]:
    before_by_pos = {s.position: s for s in before}
    after_by_pos = {s.position: s for s in after}

    changes: list[StepChange] = []
    for pos in sorted(set(before_by_pos) | set(after_by_pos)):
        old_step = before_by_pos.get(pos)
        new_step = after_by_pos.get(pos)
        if old_step is None and new_step is not None:
            changes.append(StepChange(position=pos, change="added", after=new_step.instruction))
        elif new_step is None and old_step is not None:
            changes.append(StepChange(position=pos, change="removed", before=old_step.instruction))
        elif (
            old_step is not None
            and new_step is not None
            and old_step.instruction != new_step.instruction
        ):
            changes.append(
                StepChange(
                    position=pos,
                    change="changed",
                    before=old_step.instruction,
                    after=new_step.instruction,
                )
            )
    return changes
