"""Whether texts can be sent from this deployment, by this plan's owner, and from which number."""
from __future__ import annotations

from pydantic import BaseModel


class RentReminderSmsStatus(BaseModel):
    available: bool
    # Whether the plan's owner may send texts (``rent_reminder_sms_permission``).
    allowed: bool
    from_number: str | None = None
