"""Pure ORM -> Pydantic mapping for the recipe domain.

Services orchestrate (load, decide, persist); mappers convert. Keeping the
ORM -> response conversion here means model-construction logic lives in one
place rather than being duplicated across service methods.
"""
from __future__ import annotations

from app.models.recipe.cook_log import CookLog
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion
from app.schemas.recipe.cook_log_schemas import CookLogResponse
from app.schemas.recipe.version_schemas import (
    IngredientResponse,
    StepResponse,
    VersionResponse,
)


def to_version_response(
    version: RecipeVersion,
    ingredients: list[RecipeIngredient],
    steps: list[RecipeStep],
) -> VersionResponse:
    return VersionResponse(
        id=version.id,
        recipe_id=version.recipe_id,
        version_number=version.version_number,
        parent_version_id=version.parent_version_id,
        change_note=version.change_note,
        servings=version.servings,
        prep_minutes=version.prep_minutes,
        cook_minutes=version.cook_minutes,
        created_at=version.created_at,
        ingredients=[IngredientResponse.model_validate(i) for i in ingredients],
        steps=[StepResponse.model_validate(s) for s in steps],
    )


def to_cook_log_response(cook: CookLog) -> CookLogResponse:
    return CookLogResponse.model_validate(cook)
