"""Summary of the latest non-deleted lease extension.

Exposed on ``SignedLeaseResponse.latest_extension`` so the frontend can
render the Undo button conditionally. Mirrors a ``lease_term_versions``
row created with a non-null ``source_attachment_id`` (extensions only —
the seed row is never surfaced as an "extension" to the host).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class LeaseExtensionSummary(BaseModel):
    id: uuid.UUID
    created_at: _dt.datetime
    starts_on: _dt.date
    ends_on: _dt.date
    source_attachment_id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)
