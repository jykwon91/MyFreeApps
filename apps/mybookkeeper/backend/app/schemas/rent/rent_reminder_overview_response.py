"""Everything the Rent reminders card needs on first load."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.rent.rent_reminder_plan_response import RentReminderPlanResponse
from app.schemas.rent.rent_reminder_sms_status import RentReminderSmsStatus


class RentReminderOverviewResponse(BaseModel):
    plan: RentReminderPlanResponse | None = None
    sms: RentReminderSmsStatus
    # Whether the tenant record has somewhere to send each channel. The values
    # themselves are PII and are not echoed back here.
    tenant_has_email: bool
    tenant_has_phone: bool
