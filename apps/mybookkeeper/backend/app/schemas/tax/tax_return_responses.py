from decimal import Decimal

from pydantic import BaseModel


class FormOverviewItem(BaseModel):
    form_name: str
    instance_count: int
    field_count: int


class TaxFormFieldDetail(BaseModel):
    field_id: str
    label: str
    value: float | str | bool | None
    type: str
    is_calculated: bool
    is_overridden: bool
    validation_status: str | None = None
    validation_message: str | None = None
    confidence: str | None = None
    id: str


class TaxFormInstanceDetail(BaseModel):
    instance_id: str
    instance_label: str | None = None
    property_id: str | None = None
    source_type: str | None = None
    document_id: str | None = None
    issuer_name: str | None = None
    fields: list[TaxFormFieldDetail]


class FormInstancesResponse(BaseModel):
    form_name: str
    instances: list[TaxFormInstanceDetail]


class RecomputeResponse(BaseModel):
    status: str
    forms_updated: int


class ValidationResultItem(BaseModel):
    severity: str
    form_name: str
    field_id: str | None = None
    message: str
    expected_value: float | None = None
    actual_value: float | None = None
