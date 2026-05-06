"""Admin-side invite representation.

Returned by ``POST /admin/invites`` and ``GET /admin/invites``. Includes
the token so the operator can copy the link if the email send was
flaky — the admin already has full read-access to every invite, no
PII-exposure risk above what the route is already authorising.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.platform.invite_status import InviteStatus


class InviteRead(BaseModel):
    id: uuid.UUID
    email: str
    token: str
    status: InviteStatus
    expires_at: datetime
    accepted_at: datetime | None
    accepted_by: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
