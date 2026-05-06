"""Public invite preview (the ``GET /invites/{token}/info`` payload).

Deliberately leaks NOTHING about who issued the invite — anonymous
preview endpoints should give the recipient enough to decide whether
to register, and nothing more. We expose:

  * ``email``        — already in the recipient's possession (we sent the link)
  * ``status``       — pending / accepted / expired (so the page renders
                       the right surface)
  * ``expires_at``   — recipient deserves to know the deadline

We do NOT expose:

  * inviter identity / display name — would let an attacker who guessed
    a token confirm it belonged to a specific operator
  * ``id`` / ``created_by`` / ``accepted_at`` / ``accepted_by`` — none
    are useful to the recipient and all leak structure
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.platform.invite_status import InviteStatus


class InviteInfoResponse(BaseModel):
    email: str
    status: InviteStatus
    expires_at: datetime
