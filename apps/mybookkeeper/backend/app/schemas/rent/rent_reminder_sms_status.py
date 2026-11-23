"""Whether texts can be sent from this deployment, and from which number."""
from __future__ import annotations

from pydantic import BaseModel


class RentReminderSmsStatus(BaseModel):
    available: bool
    from_number: str | None = None
