"""Summary of the latest non-deleted lease extension.

Exposed on ``SignedLeaseResponse.latest_extension`` so the frontend can
render the Undo button conditionally. Mirrors a ``lease_term_versions``
row created with a non-null ``source_attachment_id`` (extensions only —
the seed row is never surfaced as an "extension" to the host).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel


class LeaseExtensionSummary(BaseModel):
    id: uuid.UUID
    created_at: _dt.datetime
    starts_on: _dt.date
    ends_on: _dt.date
    source_attachment_id: uuid.UUID
    # Where the end date goes back to if this extension is undone.
    previous_ends_on: _dt.date | None
    # The server owns the undo window, so a phone with the wrong clock can't disagree.
    undo_expires_at: _dt.datetime
    can_undo: bool
