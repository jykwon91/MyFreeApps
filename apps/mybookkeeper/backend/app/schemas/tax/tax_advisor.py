import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TaxSuggestion(BaseModel):
    id: str
    category: str  # depreciation | expense_allocation | income_reconciliation | personal_use | passive_loss | estimated_tax | deduction_gap | data_quality
    severity: str  # high | medium | low
    title: str
    description: str
    estimated_savings: int | None = None
    action: str
    irs_reference: str | None = None
    confidence: str  # high | medium | low
    affected_properties: list[str] | None = None
    affected_form: str | None = None


class TaxAdvisorResponse(BaseModel):
    suggestions: list[TaxSuggestion]
    disclaimer: str


class TaxAdvisorSuggestionRead(TaxSuggestion):
    db_id: uuid.UUID
    status: str
    status_changed_at: datetime | None
    generation_id: uuid.UUID


class TaxAdvisorCachedResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    suggestions: list[TaxAdvisorSuggestionRead]
    disclaimer: str
    generated_at: datetime | None
    model_version: str | None


class SuggestionStatusUpdate(BaseModel):
    status: Literal["active", "dismissed", "resolved"]
