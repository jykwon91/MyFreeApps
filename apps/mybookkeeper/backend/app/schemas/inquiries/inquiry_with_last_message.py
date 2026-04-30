"""Pydantic shape returned by ``inquiry_repo.list_with_last_message``.

This is the typed result of the lateral-join query — repository function
hands the service layer a list of these, the service maps them into
``InquirySummary`` (or whatever the consumer wants).

Keeping this as a separate type rather than ``tuple[Inquiry, InquiryMessage | None]``
gives us a stable, named contract that callers can import without leaking
ORM types past the repo boundary.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InquiryWithLastMessage(BaseModel):
    # Inquiry fields used by inbox views.
    id: uuid.UUID
    source: str
    listing_id: uuid.UUID | None = None
    stage: str

    inquirer_name: str | None = None
    inquirer_employer: str | None = None

    desired_start_date: _dt.date | None = None
    desired_end_date: _dt.date | None = None

    gut_rating: int | None = None
    received_at: _dt.datetime

    # T0 — public-form spam triage data carried into the inbox card.
    spam_status: str = "unscored"
    spam_score: float | None = None
    submitted_via: str = "manual_entry"

    # Last-message join (NULL if the inquiry has no messages yet — common for
    # manual entries that haven't been replied to).
    last_message_id: uuid.UUID | None = None
    last_message_preview: str | None = None
    last_message_at: _dt.datetime | None = None

    model_config = ConfigDict(from_attributes=True)
