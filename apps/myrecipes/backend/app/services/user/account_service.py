"""MyRecipes account-management services.

Account deletion needs no service here: every user-owned table references
``users.id`` with ``ON DELETE CASCADE``.

build_export: assembles a full per-user data export (profile, recipes with
all versions/ingredients/steps, and cook logs), soft-deleted rows included.
"""
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.user_export import user_to_export_dict

from app.models.user.user import User
from app.repositories.recipe import (
    cook_log_repository,
    recipe_repository,
    recipe_version_repository,
)
from app.services.user import export_mappers


async def build_export(db: AsyncSession, user: User) -> dict:
    """Assemble the full data export for ``user``.

    Includes profile metadata, every recipe with all of its versions
    (ingredients, steps, change notes) and the user's cook logs. Soft-deleted
    recipes are still stored, so they are exported too, marked by their
    ``deleted_at`` (cook logs carry ``recipe_deleted_at``). Never includes
    hashed_password, TOTP secret, or recovery codes -- the mappers emit
    whitelisted columns only.
    """
    recipes = await recipe_repository.list_all_by_user(db, user.id)
    versions = await recipe_version_repository.list_all_by_user(db, user.id)
    version_ids = [v.id for v in versions]
    ingredients = await recipe_version_repository.get_ingredients_for_versions(db, version_ids)
    steps = await recipe_version_repository.get_steps_for_versions(db, version_ids)
    cook_logs = await cook_log_repository.list_all_by_user(db, user.id)

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": user_to_export_dict(user),
        "recipes": export_mappers.recipes_to_export_list(recipes, versions, ingredients, steps),
        "cook_logs": export_mappers.cook_logs_to_export_list(cook_logs, recipes, versions),
    }
