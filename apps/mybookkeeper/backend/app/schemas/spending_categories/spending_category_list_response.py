"""The full list of spending categories as returned by GET /spending-categories."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.spending_categories.spending_category_response import SpendingCategoryResponse


class SpendingCategoryListResponse(BaseModel):
    items: list[SpendingCategoryResponse]
