"""Pure diff engine — what changed between two version snapshots.

No DB access: it takes already-loaded version/ingredient/step rows. Per-version
fields (servings, prep/cook minutes) are compared one by one; ingredients are
matched by ``lineage_key`` (stable across versions, so a quantity edit reads
as a *change* not remove+add; a key that repeats on a side, as versions saved
before keys were checked may, is matched occurrence by occurrence, in order).
Steps have no such key, so they are aligned by their text (``step_alignment``):
an inserted or removed step reads as just that, not as a change to every step
after it. A version that only reorders ingredients has no changes, so
``order_changed`` says so separately rather than the diff reading as identical.
"""
from __future__ import annotations

import uuid
from collections import defaultdict, deque

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
from app.services.recipe.step_alignment import (
    StepPair,
    align_steps,
    normalize_step_text,
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


def _align(before: list[RecipeStep], after: list[RecipeStep]) -> list[StepPair]:
    return align_steps(
        [step.instruction for step in before], [step.instruction for step in after],
    )


def order_changed(
    before_ingredients: list[RecipeIngredient],
    after_ingredients: list[RecipeIngredient],
    before_steps: list[RecipeStep],
    after_steps: list[RecipeStep],
) -> bool:
    """Whether the new version lists the same ingredients, or some of the same steps, in another order.

    Ingredients: the ones both versions share (by lineage_key) come in a different order.
    Steps: a step moved, so the alignment has the same wording (ignoring case and spacing)
    removed in one place and added in another; it then also shows as those two step changes.
    All lists must be in position order.
    """
    matches, _ = _match_ingredients(before_ingredients, after_ingredients)
    old_indexes = [index for index in matches if index is not None]
    if old_indexes != sorted(old_indexes):
        return True
    pairs = _align(before_steps, after_steps)
    removed = {
        normalize_step_text(before_steps[old].instruction)
        for old, new in pairs if new is None and old is not None
    }
    return any(
        normalize_step_text(after_steps[new].instruction) in removed
        for old, new in pairs if old is None and new is not None
    )


def diff_steps(
    before: list[RecipeStep], after: list[RecipeStep],
) -> list[StepChange]:
    """Added, removed and changed steps in reading order, from aligning the two versions'
    steps by text. ``position`` is the step's place in the new version, or in the old one
    for a removed step. Both lists must be in position order."""
    changes: list[StepChange] = []
    for old_index, new_index in _align(before, after):
        if old_index is None and new_index is not None:
            new_step = after[new_index]
            changes.append(
                StepChange(position=new_step.position, change="added", after=new_step.instruction)
            )
        elif new_index is None and old_index is not None:
            old_step = before[old_index]
            changes.append(
                StepChange(position=old_step.position, change="removed", before=old_step.instruction)
            )
        elif old_index is not None and new_index is not None:
            old_step, new_step = before[old_index], after[new_index]
            if old_step.instruction != new_step.instruction:
                changes.append(
                    StepChange(
                        position=new_step.position,
                        change="changed",
                        before=old_step.instruction,
                        after=new_step.instruction,
                    )
                )
    return changes
