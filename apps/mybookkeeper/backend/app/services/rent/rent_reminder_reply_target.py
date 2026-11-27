"""The account a tenant's reply goes to, and its texts the reply may be answering."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.repositories.rent.rent_reminder_reply_candidate import ReplyCandidate


@dataclass(frozen=True)
class ReplyTarget:
    organization_id: uuid.UUID
    user_id: uuid.UUID
    # The account's newest text to each of its tenants on the number, newest
    # first. Never empty.
    texts: tuple[ReplyCandidate, ...]
