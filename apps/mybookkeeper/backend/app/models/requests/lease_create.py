import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class LeaseCreate(BaseModel):
    tenant_id: uuid.UUID
    property_id: uuid.UUID
    start_date: date
    end_date: Optional[date] = None
    monthly_rent: Decimal
    security_deposit: Decimal = Decimal("0")
