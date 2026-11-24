"""Service layer for personal spending categories.

All data access goes through repositories; this module never builds a query.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.spending_category_enums import DEFAULT_SPENDING_CATEGORIES
from app.db.session import unit_of_work
from app.mappers import spending_category_mapper
from app.models.transactions.spending_category import SpendingCategory
from app.repositories.transactions import spending_category_repo
from app.schemas.spending_categories.spending_category_create_request import (
    SpendingCategoryCreateRequest,
)
from app.schemas.spending_categories.spending_category_list_response import (
    SpendingCategoryListResponse,
)
from app.schemas.spending_categories.spending_category_response import SpendingCategoryResponse
from app.schemas.spending_categories.spending_category_update_request import (
    SpendingCategoryUpdateRequest,
)


class SpendingCategoryNotFoundError(LookupError):
    pass


class SpendingCategoryConflictError(ValueError):
    """A category with this name already exists in the org."""


class SpendingCategoryDefaultArchiveError(ValueError):
    """Default categories cannot be archived."""


async def _ensure_defaults_seeded(
    organization_id: uuid.UUID,
) -> None:
    """Lazily seed default categories for an org that has none yet.

    Called before every list so the first access is seamless.
    """
    async with unit_of_work() as db:
        count = await spending_category_repo.count_live(
            db, organization_id=organization_id,
        )
        if count > 0:
            return
        for name in DEFAULT_SPENDING_CATEGORIES:
            db.add(SpendingCategory(
                id=uuid.uuid4(),
                organization_id=organization_id,
                name=name,
                is_default=True,
            ))


async def list_categories(
    *,
    organization_id: uuid.UUID,
    include_archived: bool = False,
) -> SpendingCategoryListResponse:
    await _ensure_defaults_seeded(organization_id)
    async with unit_of_work() as db:
        rows = await spending_category_repo.list_for_org(
            db,
            organization_id=organization_id,
            include_archived=include_archived,
        )
    return SpendingCategoryListResponse(
        items=[spending_category_mapper.to_response(r) for r in rows],
    )


async def create_category(
    *,
    organization_id: uuid.UUID,
    payload: SpendingCategoryCreateRequest,
) -> SpendingCategoryResponse:
    async with unit_of_work() as db:
        if await spending_category_repo.name_exists(
            db, organization_id=organization_id, name=payload.name,
        ):
            raise SpendingCategoryConflictError(
                f"A spending category named '{payload.name}' already exists",
            )
        category = SpendingCategory(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=payload.name,
            is_default=False,
        )
        created = await spending_category_repo.create(db, category)
        return spending_category_mapper.to_response(created)


async def update_category(
    *,
    category_id: uuid.UUID,
    organization_id: uuid.UUID,
    payload: SpendingCategoryUpdateRequest,
) -> SpendingCategoryResponse:
    async with unit_of_work() as db:
        category = await spending_category_repo.get(
            db, category_id=category_id, organization_id=organization_id,
        )
        if category is None:
            raise SpendingCategoryNotFoundError(category_id)
        if await spending_category_repo.name_exists(
            db, organization_id=organization_id, name=payload.name, exclude_id=category_id,
        ):
            raise SpendingCategoryConflictError(
                f"A spending category named '{payload.name}' already exists",
            )
        category.name = payload.name
        await db.flush()
        await db.refresh(category)
        return spending_category_mapper.to_response(category)


async def archive_category(
    *,
    category_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> SpendingCategoryResponse:
    async with unit_of_work() as db:
        category = await spending_category_repo.get(
            db, category_id=category_id, organization_id=organization_id,
        )
        if category is None:
            raise SpendingCategoryNotFoundError(category_id)
        if category.is_default:
            raise SpendingCategoryDefaultArchiveError(
                "Default spending categories cannot be archived",
            )
        category.archived_at = _dt.datetime.now(_dt.timezone.utc)
        await db.flush()
        await db.refresh(category)
        return spending_category_mapper.to_response(category)


async def unarchive_category(
    *,
    category_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> SpendingCategoryResponse:
    async with unit_of_work() as db:
        category = await spending_category_repo.get(
            db, category_id=category_id, organization_id=organization_id,
        )
        if category is None:
            raise SpendingCategoryNotFoundError(category_id)
        # Restore: check the name is still available (another live category
        # could have taken it while this one was archived).
        if await spending_category_repo.name_exists(
            db, organization_id=organization_id, name=category.name, exclude_id=category_id,
        ):
            raise SpendingCategoryConflictError(
                f"A live category named '{category.name}' already exists; "
                "rename it before unarchiving this one",
            )
        category.archived_at = None
        await db.flush()
        await db.refresh(category)
        return spending_category_mapper.to_response(category)
