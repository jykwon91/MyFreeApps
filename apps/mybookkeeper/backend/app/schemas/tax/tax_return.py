import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.tax_return_enums import JURISDICTION_MAX_LENGTH, MAX_TAX_RETURN_YEAR, MIN_TAX_RETURN_YEAR
from app.schemas.tax.filing_status import FilingStatus

TAX_DISCLAIMER = (
    "Tax values are AI-generated estimates. Review all values before filing. "
    "You are responsible for the accuracy of your tax return."
)


class TaxReturnRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    tax_year: int
    filing_status: str
    jurisdiction: str
    status: str
    needs_recompute: bool
    filed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    disclaimer: str = TAX_DISCLAIMER

    model_config = {"from_attributes": True}


class TaxReturnCreate(BaseModel):
    tax_year: int = Field(ge=MIN_TAX_RETURN_YEAR, le=MAX_TAX_RETURN_YEAR)
    filing_status: FilingStatus = "single"
    jurisdiction: str = Field(default="federal", min_length=1, max_length=JURISDICTION_MAX_LENGTH)
