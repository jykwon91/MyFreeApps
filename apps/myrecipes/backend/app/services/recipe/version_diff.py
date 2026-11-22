"""Pure diff engine — what changed between two version snapshots.

No DB access: it takes already-loaded version/ingredient/step rows. Per-version
fields (servings, prep/cook minutes) are compared one by one; ingredients are
matched by ``lineage_key`` (stable across versions, so a quantity edit reads
as a *change* not remove+add; a key that repeats on a side, as versions saved
before keys were checked may, is matched occurrence by occurrence, in order);
steps are matched by ``position``. A version
that only reorders ingredients or steps has no changes, so ``order_changed``
says so separately rather than the diff reading as identical.
"""
from __future__ import annotations

import uuid
from collections import Counter, defaultdict, deque

from app.core.version_diff_fields import VERSION_DIFF_FIELDS
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion
from app.schemas.recipe.diff_schemas import (
    FieldChange,
    IngredientChange,
    IngredientSnapshot,
    StepChange,
)


def diff_fields(
    before: RecipeVersion | None, after: RecipeVersion,
) -> list[FieldChange]:
    """Each per-version field whose value differs. ``before`` is None for the
    first version, so every field it sets reads as a change from empty."""
    changes: list[FieldChange] = []
    for field in VERSION_DIFF_FIELDS:
        old_value = getattr(before, field) if before is not None else None
        new_value = getattr(after, field)
        if old_value != new_value:
            changes.append(FieldChange(field=field, before=old_value, after=new_value))
    return changes


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


def _match_ingredients(
    before: list[RecipeIngredient], after: list[RecipeIngredient],
) -> tuple[list[int | None], list[int]]:
    """Match each new-version ingredient to an old one with the same lineage_key.

    Returns, for each ingredient of ``after``, the index of its match in ``before`` (None
    for an added one), and the indexes of ``before`` left unmatched (removed), in order. A
    key that appears more than once on a side (versions saved before keys were checked could
    repeat one) is matched occurrence by occurrence, so no row is dropped.
    """
    unmatched: dict[uuid.UUID, deque[int]] = defaultdict(deque)
    for index, ing in enumerate(before):
        unmatched[ing.lineage_key].append(index)
    matches = [
        unmatched[ing.lineage_key].popleft() if unmatched.get(ing.lineage_key) else None
        for ing in after
    ]
    removed = sorted(index for indexes in unmatched.values() for index in indexes)
    return matches, removed


def diff_ingredients(
    before: list[RecipeIngredient], after: list[RecipeIngredient],
) -> list[IngredientChange]:
    """Added and changed ingredients in the new version's order, then removed ones in the
    old version's order. A repeated lineage_key is matched occurrence by occurrence, in
    order, so every row shows. Both lists must be in position order."""
    matches, removed = _match_ingredients(before, after)

    changes: list[IngredientChange] = []
    for new_ing, old_index in zip(after, matches):
        if old_index is None:
            changes.append(
                IngredientChange(
                    lineage_key=new_ing.lineage_key, change="added", after=_snapshot(new_ing),
                )
            )
        elif not _ingredient_equal(before[old_index], new_ing):
            changes.append(
                IngredientChange(
                    lineage_key=new_ing.lineage_key,
                    change="changed",
                    before=_snapshot(before[old_index]),
                    after=_snapshot(new_ing),
                )
            )
    for old_index in removed:
        old_ing = before[old_index]
        changes.append(
            IngredientChange(
                lineage_key=old_ing.lineage_key, change="removed", before=_snapshot(old_ing),
            )
        )
    return changes


def order_changed(
    before_ingredients: list[RecipeIngredient],
    after_ingredients: list[RecipeIngredient],
    before_steps: list[RecipeStep],
    after_steps: list[RecipeStep],
) -> bool:
    """Whether the new version lists the same ingredients, or the same steps, in another order.

    Ingredients: the ones both versions share (by lineage_key) come in a different order.
    Steps are matched by position, so a reorder already shows as step changes; this also
    reports it when the two versions have the same instructions in a different order.
    All lists must be in position order.
    """
    matches, _ = _match_ingredients(before_ingredients, after_ingredients)
    old_indexes = [index for index in matches if index is not None]
    if old_indexes != sorted(old_indexes):
        return True
    before_text = [step.instruction for step in before_steps]
    after_text = [step.instruction for step in after_steps]
    return before_text != after_text and Counter(before_text) == Counter(after_text)


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
