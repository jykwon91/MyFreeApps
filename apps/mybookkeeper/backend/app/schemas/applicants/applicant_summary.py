"""Minimal Applicant payload for list / pipeline views.

Mirrors the ``InquirySummary`` shape (Phase 2): only the fields the host
needs to triage a list page. PII is included as decrypted plaintext but the
list page only renders a subset (legal_name + employer_or_hospital). DOB,
vehicle make/model, ID document key are excluded — they belong behind the
sensitive-unlock toggle on the detail page per RENTALS_PLAN.md §9.1.

``tenant_ended_at`` and ``tenant_ended_reason`` are included for the
/tenants page where the "Show ended" toggle needs to display the ended
date and reason without navigating to the detail page.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ApplicantSummary(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    inquiry_id: uuid.UUID | None = None

    legal_name: str | None = None
    employer_or_hospital: str | None = None

    contract_start: _dt.date | None = None
    contract_end: _dt.date | None = None

    stage: str

    tenant_ended_at: _dt.datetime | None = None
    tenant_ended_reason: str | None = None

    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
