"""Pydantic schema for an Applicant response.

PII fields (``legal_name`` etc.) are returned plaintext because the
``EncryptedString`` TypeDecorator transparently decrypts on read. Routes
that serialize this schema MUST be auth-protected (Phase 3 PR 3.2 / 3.3 /
3.4 own the routes — none exist in PR 3.1a).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ApplicantResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    inquiry_id: uuid.UUID | None = None

    legal_name: str | None = None
    dob: str | None = None
    employer_or_hospital: str | None = None
    vehicle_make_model: str | None = None
    id_document_storage_key: str | None = None

    contract_start: _dt.date | None = None
    contract_end: _dt.date | None = None
    smoker: bool | None = None
    pets: str | None = None
    referred_by: str | None = None

    stage: str

    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
