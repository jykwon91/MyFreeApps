"""Response body for ``POST /invites/{token}/accept``.

Echoes back the invite id and the time it was consumed so the frontend
can render a "you've been added — welcome" toast without a follow-up
fetch.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class InviteAcceptResponse(BaseModel):
    invite_id: uuid.UUID
    accepted_at: datetime
