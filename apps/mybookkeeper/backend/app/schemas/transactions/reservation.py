import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class OccupancyResponse(BaseModel):
    total_nights: int
    reservation_count: int
    total_days: int
    occupancy_rate: Decimal


class ReservationRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    property_id: uuid.UUID | None = None
    transaction_id: uuid.UUID | None = None

    res_code: str
    platform: str | None = None

    check_in: date
    check_out: date
    nights: int | None = None

    gross_booking: Decimal | None = None
    net_booking_revenue: Decimal | None = None
    commission: Decimal | None = None
    cleaning_fee: Decimal | None = None
    insurance_fee: Decimal | None = None
    net_client_earnings: Decimal | None = None
    funds_due_to_client: Decimal | None = None

    guest_name: str | None = None

    statement_period_start: date | None = None
    statement_period_end: date | None = None

    created_at: datetime

    model_config = {"from_attributes": True}
