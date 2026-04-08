import uuid
from datetime import datetime

from pydantic import BaseModel

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
    tax_year: int
    filing_status: str = "single"
    jurisdiction: str = "federal"
