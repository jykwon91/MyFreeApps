"""Recipe list service: one page of the recipe library with its rollups and a true total.

Public read (not tenant-scoped) unless ``owner_me``, which scopes to the viewer.
Split from ``recipe_service`` so the list's paging lives on its own.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.recipe import (
    cook_log_repository,
    recipe_repository,
    recipe_version_repository,
)
from app.repositories.user import user_repo as user_repository
from app.schemas.recipe.recipe_list_page import RecipeListPage
from app.schemas.recipe.recipe_schemas import RecipeSummary


async def list_public_recipes(
    db: AsyncSession,
    viewer_id: uuid.UUID | None,
    *,
    search: str | None = None,
    limit: int,
    offset: int = 0,
    owner_me: bool = False,
) -> RecipeListPage:
    """One page of the public library (or the viewer's own with owner_me), and how many match in all.

    ``viewer_id`` is the OPTIONAL current user. When ``owner_me`` is set the
    result is scoped to the viewer's recipes (the route rejects anonymous
    ``owner=me`` with 401 before we get here). Otherwise every non-deleted
    recipe is paged. ``total`` is a COUNT with the same filters as the page,
    so a client knows whether there is another page to load.

    ``is_owner`` is computed per row; ``user_id`` is never returned. Cook-log
    rollups are populated only for recipes the viewer owns — the rollup query
    is issued for owned ids only, so another user's cook data is never read.
    """
    if owner_me:
        assert viewer_id is not None  # route guarantees this
        recipes = await recipe_repository.list_by_user(
            db, viewer_id, search=search, limit=limit, offset=offset,
        )
        total = await recipe_repository.count_by_user(db, viewer_id, search=search)
    else:
        recipes = await recipe_repository.list_public(
            db, search=search, limit=limit, offset=offset,
        )
        total = await recipe_repository.count_public(db, search=search)

    recipe_ids = [r.id for r in recipes]
    counts = await recipe_version_repository.counts_and_latest_by_recipe(db, recipe_ids)
    names = await user_repository.display_names_by_ids(db, {r.user_id for r in recipes})

    owned_ids = [
        r.id for r in recipes if viewer_id is not None and r.user_id == viewer_id
    ]
    cooks = await cook_log_repository.best_rating_and_last_cooked_by_recipe(db, owned_ids)

    summaries: list[RecipeSummary] = []
    for r in recipes:
        is_owner = viewer_id is not None and r.user_id == viewer_id
        version_count, latest_number = counts.get(r.id, (0, None))
        best_rating, last_cooked = cooks.get(r.id, (None, None)) if is_owner else (None, None)
        summaries.append(
            RecipeSummary(
                id=r.id,
                title=r.title,
                description=r.description,
                source=r.source,
                created_at=r.created_at,
                updated_at=r.updated_at,
                version_count=version_count,
                latest_version_number=latest_number,
                is_owner=is_owner,
                owner_display_name=names.get(r.user_id, ""),
                best_rating=best_rating,
                last_cooked_at=last_cooked,
            )
        )
    return RecipeListPage(items=summaries, total=total, has_more=offset + len(summaries) < total)
