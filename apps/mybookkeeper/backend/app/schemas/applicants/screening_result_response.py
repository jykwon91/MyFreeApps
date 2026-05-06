"""Pydantic schema for a ScreeningResult response.

Includes ``presigned_url`` which is populated by ``screening_response_builder``
on read paths (mirrors how listing photos surface a short-lived URL — the
underlying object key is never exposed to the browser directly). PR 3.3
populates ``uploaded_at`` / ``uploaded_by_user_id`` via the upload pipeline.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ScreeningResultResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    provider: str
    status: str
    report_storage_key: str | None = None
    adverse_action_snippet: str | None = None
    notes: str | None = None
    requested_at: _dt.datetime
    completed_at: _dt.datetime | None = None
    uploaded_at: _dt.datetime
    uploaded_by_user_id: uuid.UUID
    created_at: _dt.datetime
    # Populated by the screening response builder on read paths. None when
    # storage is unavailable or the row has no report yet.
    presigned_url: str | None = None
    # ``False`` means the underlying MinIO object is missing. UI surfaces a
    # "Report missing" affordance instead of a broken link. Defaults to
    # ``True`` so rows without a report yet (``report_storage_key=None``)
    # don't get falsely flagged.
    is_available: bool = True

    model_config = ConfigDict(from_attributes=True)
