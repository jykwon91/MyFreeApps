"""One reminder text a tenant's reply may be answering: its routing columns only."""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class ReplyCandidate:
    send_id: uuid.UUID
    applicant_id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    due_date: _dt.date
    # When the text's current try was claimed.
    created_at: _dt.datetime
    # Twilio refused it because the tenant had texted STOP, so it never reached them.
    blocked_by_stop: bool
