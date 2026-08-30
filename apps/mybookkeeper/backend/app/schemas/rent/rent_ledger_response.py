"""The full rent picture for one tenant."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.rent.rent_charge_response import RentChargeResponse
from app.schemas.rent.rent_payment_response import RentPaymentResponse
from app.schemas.rent.rent_period_summary import RentPeriodSummary
from app.schemas.rent.rent_schedule_response import RentScheduleResponse


class RentLedgerResponse(BaseModel):
    applicant_id: uuid.UUID
    as_of: _dt.date

    schedules: list[RentScheduleResponse]
    charges: list[RentChargeResponse]
    payments: list[RentPaymentResponse]

    # The period containing ``as_of``. NULL when no schedule covers today —
    # either none exists yet or the tenancy has ended.
    current_period: RentPeriodSummary | None = None

    total_charged: Decimal
    total_paid: Decimal
    # Positive = tenant owes. Negative = tenant is in credit (paid ahead).
    balance: Decimal
    # Payments received that no charge has consumed yet.
    unapplied_credit: Decimal
