"""A claimed company research run: what the run needs, read before any slow call."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ResearchRunClaim:
    company_id: uuid.UUID
    user_id: uuid.UUID
    company_name: str
    primary_domain: str | None
    # The claim's token: releasing clears the claim only while it still holds this value.
    claimed_at: datetime
