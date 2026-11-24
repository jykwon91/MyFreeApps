"""Payload for POST /spending-categories."""
from __future__ import annotations

from pydantic import BaseModel, field_validator

from app.core.spending_category_enums import SPENDING_CATEGORY_NAME_MAX_LENGTH


class SpendingCategoryCreateRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _check_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Name must not be blank")
        if len(stripped) > SPENDING_CATEGORY_NAME_MAX_LENGTH:
            raise ValueError(
                f"Name must be at most {SPENDING_CATEGORY_NAME_MAX_LENGTH} characters",
            )
        return stripped
