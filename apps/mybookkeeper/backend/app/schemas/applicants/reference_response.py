"""Pydantic schema for a Reference (applicant_references) response.

PII fields (``reference_name``, ``reference_contact``) are returned plaintext
via the ``EncryptedString`` TypeDecorator. Auth-protected at the route layer.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ReferenceResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    relationship: str
    reference_name: str
    reference_contact: str
    notes: str | None = None
    contacted_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
