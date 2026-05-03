"""Pydantic schema for full Applicant detail responses.

Includes all 1:N children (screening_results, references, video_call_notes,
applicant_events) — used by GET /applicants/{id}. The detail page renders
the sensitive section behind a UI unlock toggle so PII isn't visible by
default per RENTALS_PLAN.md §9.1.

PII fields are returned plaintext via the ``EncryptedString`` TypeDecorator.
Auth-protected at the route layer.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.applicants.applicant_event_response import ApplicantEventResponse
from app.schemas.applicants.reference_response import ReferenceResponse
from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.schemas.applicants.video_call_note_response import VideoCallNoteResponse


class ApplicantDetailResponse(BaseModel):
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

    tenant_ended_at: _dt.datetime | None = None
    tenant_ended_reason: str | None = None

    created_at: _dt.datetime
    updated_at: _dt.datetime

    screening_results: list[ScreeningResultResponse] = []
    references: list[ReferenceResponse] = []
    video_call_notes: list[VideoCallNoteResponse] = []
    events: list[ApplicantEventResponse] = []

    model_config = ConfigDict(from_attributes=True)
