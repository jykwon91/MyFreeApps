"""Pure ORM -> JSON-safe dict mapping for the account data export.

Only whitelisted domain columns are emitted, so secrets on the user row
(hashed_password, TOTP secret, recovery codes, tokens) can never leak.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from app.models.recipe.cook_log import CookLog
from app.models.recipe.recipe import Recipe
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _str(value: object | None) -> str | None:
    return str(value) if value is not None else None


def user_to_export_dict(user: Any) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "is_verified": user.is_verified,
        "totp_enabled": user.totp_enabled,
    }


def ingredient_to_export_dict(ingredient: RecipeIngredient) -> dict[str, Any]:
    return {
        "id": str(ingredient.id),
        "lineage_key": str(ingredient.lineage_key),
        "position": ingredient.position,
        "name": ingredient.name,
        "quantity": float(ingredient.quantity) if ingredient.quantity is not None else None,
        "unit": ingredient.unit,
        "note": ingredient.note,
    }


def step_to_export_dict(step: RecipeStep) -> dict[str, Any]:
    return {"id": str(step.id), "position": step.position, "instruction": step.instruction}


def cook_log_to_export_dict(cook: CookLog) -> dict[str, Any]:
    return {
        "id": str(cook.id),
        "version_id": str(cook.version_id),
        "cooked_at": _iso(cook.cooked_at),
        "rating": cook.rating,
        "outcome_notes": cook.outcome_notes,
        "created_at": _iso(cook.created_at),
    }


def version_to_export_dict(
    version: RecipeVersion,
    ingredients: list[RecipeIngredient],
    steps: list[RecipeStep],
) -> dict[str, Any]:
    return {
        "id": str(version.id),
        "version_number": version.version_number,
        "parent_version_id": _str(version.parent_version_id),
        "change_note": version.change_note,
        "servings": version.servings,
        "prep_minutes": version.prep_minutes,
        "cook_minutes": version.cook_minutes,
        "created_at": _iso(version.created_at),
        "ingredients": [ingredient_to_export_dict(i) for i in ingredients],
        "steps": [step_to_export_dict(s) for s in steps],
    }


def recipes_to_export_list(
    recipes: list[Recipe],
    versions: list[RecipeVersion],
    ingredients: list[RecipeIngredient],
    steps: list[RecipeStep],
) -> list[dict[str, Any]]:
    """Nest versions (with ingredients + steps) under their recipes."""
    ingredients_by_version: dict[Any, list[RecipeIngredient]] = defaultdict(list)
    for ingredient in ingredients:
        ingredients_by_version[ingredient.version_id].append(ingredient)
    steps_by_version: dict[Any, list[RecipeStep]] = defaultdict(list)
    for step in steps:
        steps_by_version[step.version_id].append(step)
    versions_by_recipe: dict[Any, list[RecipeVersion]] = defaultdict(list)
    for version in versions:
        versions_by_recipe[version.recipe_id].append(version)

    return [
        {
            "id": str(recipe.id),
            "title": recipe.title,
            "description": recipe.description,
            "source": recipe.source,
            "created_at": _iso(recipe.created_at),
            "updated_at": _iso(recipe.updated_at),
            "versions": [
                version_to_export_dict(
                    v, ingredients_by_version[v.id], steps_by_version[v.id],
                )
                for v in versions_by_recipe[recipe.id]
            ],
        }
        for recipe in recipes
    ]
