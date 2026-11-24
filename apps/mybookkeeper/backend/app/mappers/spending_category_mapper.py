"""Turn stored spending categories into what the API returns.

Pure: no database, no I/O.
"""
from __future__ import annotations

from app.models.transactions.spending_category import SpendingCategory
from app.schemas.spending_categories.spending_category_response import SpendingCategoryResponse


def to_response(category: SpendingCategory) -> SpendingCategoryResponse:
    return SpendingCategoryResponse(
        id=category.id,
        organization_id=category.organization_id,
        name=category.name,
        is_default=category.is_default,
        archived_at=category.archived_at,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )
