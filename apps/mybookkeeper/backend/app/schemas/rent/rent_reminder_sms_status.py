"""Whether texts can be sent from this deployment, and from which number."""
from __future__ import annotations

from pydantic import BaseModel


class RentReminderSmsStatus(BaseModel):
    available: bool
    from_number: str | None = None
    # Bodies are end-to-end encrypted, so the relay never reads them.
    encrypted: bool
    # Register this in the httpSMS dashboard (Settings → Webhooks).
    webhook_url: str
