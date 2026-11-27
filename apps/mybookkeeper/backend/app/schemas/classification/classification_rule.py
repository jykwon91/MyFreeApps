import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.payee_rule_constants import (
    MAX_RULE_SPLIT_PROPERTIES,
    RULE_PERSONAL_NO_PROPERTY,
    RULE_SPLIT_NEEDS_TWO,
    RULE_SPLIT_OR_PROPERTY,
    RULE_SPLIT_PROPERTY_REPEATED,
)
from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.core.tags import EXPENSE_TAGS, NEUTRAL_TAGS, REVENUE_TAGS

VALID_CATEGORIES = REVENUE_TAGS | EXPENSE_TAGS | NEUTRAL_TAGS | frozenset({"uncategorized"})


class ClassificationRuleCreate(BaseModel):
    match_type: Literal["vendor", "sender", "filename", "keyword", "document_type"]
    match_pattern: str = Field(min_length=1, max_length=500)
    match_context: str | None = Field(default=None, max_length=500)
    category: str
    property_id: uuid.UUID | None = None
    activity_id: uuid.UUID | None = None
    # Rental, business or personal; None leaves a matching row's scope as it is.
    transaction_scope: Literal["rental", "business", "personal"] | None = None
    # Split each matching payment evenly across these, in this order.
    split_property_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_RULE_SPLIT_PROPERTIES)

    @field_validator("category")
    @classmethod
    def category_must_be_valid(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category '{v}'. Must be one of: {sorted(VALID_CATEGORIES)}")
        return v

    @model_validator(mode="after")
    def property_or_split(self) -> "ClassificationRuleCreate":
        if self.split_property_ids:
            if len(self.split_property_ids) < 2:
                raise ValueError(RULE_SPLIT_NEEDS_TWO)
            if len(set(self.split_property_ids)) != len(self.split_property_ids):
                raise ValueError(RULE_SPLIT_PROPERTY_REPEATED)
            if self.property_id is not None:
                raise ValueError(RULE_SPLIT_OR_PROPERTY)
        has_property = self.property_id is not None or bool(self.split_property_ids)
        if self.transaction_scope == TRANSACTION_SCOPE_PERSONAL and has_property:
            raise ValueError(RULE_PERSONAL_NO_PROPERTY)
        return self


class ClassificationRuleRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    match_type: str
    match_pattern: str
    match_context: str | None
    category: str
    property_id: uuid.UUID | None
    activity_id: uuid.UUID | None
    transaction_scope: str | None
    split_property_ids: list[uuid.UUID]
    source: str
    priority: int
    times_applied: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
