"""Request schemas for the calendar review-queue endpoints.

``extra="forbid"`` on every schema prevents unknown fields from silently
passing validation (per CLAUDE.md security guidance).
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class ResolveQueueItemRequest(BaseModel):
    """Body for POST /calendar/review-queue/{id}/resolve."""
    listing_id: uuid.UUID

    model_config = ConfigDict(extra="forbid")


class IgnoreQueueItemRequest(BaseModel):
    """Body for POST /calendar/review-queue/{id}/ignore.

    ``source_listing_id`` is the opaque identifier the channel uses for this
    listing in emails (extracted from ``parsed_payload``). The service copies
    it into the blocklist row.

    ``reason`` is optional free-text the user may provide.
    """
    source_listing_id: str
    reason: str | None = None

    model_config = ConfigDict(extra="forbid")
