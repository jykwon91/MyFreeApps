import uuid

from pydantic import BaseModel


class FormCompleteness(BaseModel):
    form_name: str
    instance_label: str | None
    filled_fields: list[str]
    missing_fields: list[str]
    total_expected: int
    total_filled: int
    highlights: list[str]


class TaxCompletenessResponse(BaseModel):
    tax_year: int
    tax_return_id: uuid.UUID
    needs_recompute: bool
    forms: list[FormCompleteness]
    summary: str
