import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


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
    value_numeric: Decimal | None = None
    value_text: str | None = None
    value_boolean: bool | None = None
    override_reason: str | None = None
