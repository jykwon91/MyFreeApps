import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.tags import EXPENSE_TAGS, NEUTRAL_TAGS, REVENUE_TAGS

VALID_CATEGORIES = REVENUE_TAGS | EXPENSE_TAGS | NEUTRAL_TAGS | frozenset({"uncategorized"})


class ClassificationRuleCreate(BaseModel):
    match_type: Literal["vendor", "sender", "filename", "keyword", "document_type"]
    match_pattern: str = Field(min_length=1, max_length=500)
    match_context: str | None = Field(default=None, max_length=500)
    category: str
    property_id: uuid.UUID | None = None
    activity_id: uuid.UUID | None = None

    @field_validator("category")
    @classmethod
    def category_must_be_valid(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category '{v}'. Must be one of: {sorted(VALID_CATEGORIES)}")
        return v


class ClassificationRuleRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    match_type: str
    match_pattern: str
    match_context: str | None
    category: str
    property_id: uuid.UUID | None
    activity_id: uuid.UUID | None
    source: str
    priority: int
    times_applied: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
