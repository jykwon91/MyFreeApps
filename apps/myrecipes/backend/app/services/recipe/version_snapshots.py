"""Snapshot rows for a new version, built from the submitted ingredients and steps.

A tweak's ingredients may carry a ``lineage_key`` from the version it starts from, so the
diff reads "same ingredient, changed". Keys come from the client, so they are checked
first: a key may only be one the base version has, and only as often as the base has it
(once, for any version saved since this check; more only if an older version already
repeats one). A new recipe has no base, so its ingredients can't carry a key at all.
"""
from __future__ import annotations

import logging
import uuid
from collections import Counter

from app.core.invalid_lineage_key_error import InvalidLineageKeyError
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.schemas.recipe.version_schemas import IngredientInput, StepInput

logger = logging.getLogger(__name__)


def check_lineage_keys(
    inputs: list[IngredientInput], base: list[RecipeIngredient] | None,
) -> None:
    """Raise InvalidLineageKeyError for a repeated key or one the base version doesn't have.

    ``base`` is the base version's ingredients, or None when there is no base (a new recipe).
    """
    allowed = Counter(ing.lineage_key for ing in base or [])
    used = Counter(ing.lineage_key for ing in inputs if ing.lineage_key is not None)
    for key, count in used.items():
        if base is None:
            logger.info("Rejected a new recipe carrying lineage_key %s", key)
            raise InvalidLineageKeyError(
                "A new recipe has no earlier version, so its ingredients can't carry a lineage_key. "
                "Leave lineage_key out."
            )
        if allowed[key] == 0:
            logger.info("Rejected a tweak with lineage_key %s, not in its base version", key)
            raise InvalidLineageKeyError(
                "An ingredient's lineage_key doesn't belong to the version you started from. "
                "Leave lineage_key out for a new ingredient."
            )
        if count > allowed[key]:
            logger.info("Rejected a tweak using lineage_key %s %d times (base has %d)", key, count, allowed[key])
            raise InvalidLineageKeyError(
                "An ingredient's lineage_key is used more times than in the version you started from. "
                "Each ingredient carried over keeps its own key."
            )


def make_ingredients(
    version_id: uuid.UUID, inputs: list[IngredientInput],
) -> list[RecipeIngredient]:
    return [
        RecipeIngredient(
            version_id=version_id,
            lineage_key=ing.lineage_key or uuid.uuid4(),
            position=i,
            name=ing.name,
            quantity=ing.quantity,
            unit=ing.unit,
            note=ing.note,
        )
        for i, ing in enumerate(inputs, start=1)
    ]


def make_steps(version_id: uuid.UUID, inputs: list[StepInput]) -> list[RecipeStep]:
    return [
        RecipeStep(version_id=version_id, position=i, instruction=s.instruction)
        for i, s in enumerate(inputs, start=1)
    ]
