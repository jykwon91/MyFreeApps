"""Inquiry state carried from the pre-scoring transaction to the Claude call."""
from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class PendingClaudeScoring:
    inquiry_id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    phone: str
    why_this_room: str
    listing_monthly_rent: str
    listing_type: str
