import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.properties.lease import LeaseStatus


class LeaseRead(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    tenant_id: uuid.UUID
    start_date: date
    end_date: date | None = None
    monthly_rent: Decimal
    security_deposit: Decimal = Decimal("0")
    status: LeaseStatus = LeaseStatus.ACTIVE
    created_at: datetime

    model_config = {"from_attributes": True}
