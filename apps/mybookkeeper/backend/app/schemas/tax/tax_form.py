import uuid
from datetime import datetime
from decimal import Decimal

from typing import Annotated, Self

from pydantic import BaseModel, StringConstraints, model_validator

OverrideReason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]

VALUE_KEYS = frozenset({"value_numeric", "value_text", "value_boolean"})


class TaxFormFieldSourceRead(BaseModel):
    id: uuid.UUID
    field_id: uuid.UUID
    source_type: str
    source_id: uuid.UUID | None = None
    amount: Decimal
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaxFormFieldRead(BaseModel):
    id: uuid.UUID
    form_instance_id: uuid.UUID
    field_id: str
    field_label: str
    value_numeric: Decimal | None = None
    value_text: str | None = None
    value_boolean: bool | None = None
    is_calculated: bool = False
    is_overridden: bool = False
    override_reason: str | None = None
    validation_status: str = "unvalidated"
    validation_message: str | None = None
    confidence: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaxFormInstanceRead(BaseModel):
    id: uuid.UUID
    tax_return_id: uuid.UUID
    form_name: str
    instance_label: str | None = None
    source_type: str
    document_id: uuid.UUID | None = None
    extraction_id: uuid.UUID | None = None
    property_id: uuid.UUID | None = None
    issuer_ein: str | None = None
    issuer_name: str | None = None
    status: str = "draft"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaxFormFieldUpdate(BaseModel):
    """Override a field. A value key that is sent as null clears that column;
    a key that is not sent leaves the column untouched."""

    value_numeric: Decimal | None = None
    value_text: str | None = None
    value_boolean: bool | None = None
    override_reason: OverrideReason

    @model_validator(mode="after")
    def _require_a_value_key(self) -> Self:
        if not self.model_fields_set & VALUE_KEYS:
            raise ValueError(
                "Send at least one of value_numeric, value_text, value_boolean "
                "(null clears the value)"
            )
        return self
