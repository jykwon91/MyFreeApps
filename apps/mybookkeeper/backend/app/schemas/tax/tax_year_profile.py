import uuid

from pydantic import BaseModel, Field

from app.schemas.tax.filing_status import FilingStatus


class TaxYearProfileUpdate(BaseModel):
    filing_status: FilingStatus | None = None
    dependents_count: int | None = Field(default=None, ge=0, le=20)
    property_use_days: dict[str, int] | None = None
    home_office_sqft: int | None = None
    home_total_sqft: int | None = None
    business_mileage: int | None = None


class TaxYearProfileRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    tax_year: int
    filing_status: str | None
    dependents_count: int
    property_use_days: dict[str, int]
    home_office_sqft: int | None
    home_total_sqft: int | None
    business_mileage: int | None

    model_config = {"from_attributes": True}
