"""Admin-side invite representation.

Returned by ``POST /admin/invites`` and ``GET /admin/invites``.

The raw token deliberately does NOT appear here. Tokens are sent
exactly once, via email, to the recipient. The DB persists only
``sha256(token)``, so even an admin cannot retrieve a usable token
after creation. If a recipient never gets the email, the admin's
recourse is to cancel the invite and issue a fresh one — not to copy
the token off the admin UI.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.platform.invite_status import InviteStatus


class InviteRead(BaseModel):
    id: uuid.UUID
    email: str
    status: InviteStatus
    expires_at: datetime
    accepted_at: datetime | None
    accepted_by: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
