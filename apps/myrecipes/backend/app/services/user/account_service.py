"""MyRecipes account-management services.

delete_user_data: wired into the shared account-deletion router. Deletes
all app-owned data for the user. As domain models are added, populate this
with the right per-table deletes.

build_export: assembles a full per-user data export (profile, recipes with
all versions/ingredients/steps, and cook logs).
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.recipe import (
    cook_log_repository,
    recipe_repository,
    recipe_version_repository,
)
from app.services.user import export_mappers

logger = logging.getLogger(__name__)


async def delete_user_data(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Delete all app-owned data for ``user_id``.

    Scaffold stub: no user-scoped domain rows yet. The shared deletion
    router handles the user row itself via its own cascade logic.
    """
    logger.info("delete_user_data called for user_id=%s -- no domain rows to delete", user_id)


async def build_export(db: AsyncSession, user) -> dict:
    """Assemble the full data export for ``user``.

    Includes profile metadata, every non-deleted recipe with all of its
    versions (ingredients, steps, change notes) and the user's cook logs.
    Soft-deleted recipes (and their versions/cook logs) are omitted, matching
    MyBookkeeper's export. Never includes hashed_password, TOTP secret, or
    recovery codes -- the mappers emit whitelisted columns only.
    """
    recipes = await recipe_repository.list_all_by_user(db, user.id)
    versions = await recipe_version_repository.list_all_by_user(db, user.id)
    version_ids = [v.id for v in versions]
    ingredients = await recipe_version_repository.get_ingredients_for_versions(db, version_ids)
    steps = await recipe_version_repository.get_steps_for_versions(db, version_ids)
    cook_logs = await cook_log_repository.list_all_by_user(db, user.id)

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": export_mappers.user_to_export_dict(user),
        "recipes": export_mappers.recipes_to_export_list(recipes, versions, ingredients, steps),
        "cook_logs": [export_mappers.cook_log_to_export_dict(c) for c in cook_logs],
    }
