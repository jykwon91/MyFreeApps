"""Pydantic shape for an entry in the spam-assessment audit trail.

Returned by ``GET /inquiries/{id}`` and surfaced in the operator's expandable
"Spam triage" panel on the inquiry detail page.

Note that ``details_json`` may include the prompt the public-form service
sent to Claude — but PII (email, phone, free-text) has already been redacted
upstream in ``inquiry_spam_service`` per RENTALS_PLAN.md §8.7.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InquirySpamAssessmentResponse(BaseModel):
    id: uuid.UUID
    inquiry_id: uuid.UUID
    assessment_type: str
    passed: bool | None = None
    score: float | None = None
    flags: list[str] | None = None
    details_json: dict | None = None
    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
