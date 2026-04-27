"""Pydantic schema for POST /inquiries (manual create).

Per RENTALS_PLAN.md §8.5, even manual entries validate inputs Pydantic-side
(defense in depth — PR 2.2 will add DKIM/SPF + prompt-injection guards on top
of this for parsed emails).

Constraints:
- ``source`` must be one of ``INQUIRY_SOURCES``.
- ``external_inquiry_id`` is required when source != 'direct' (FF / TNH / other
  inquiries always carry a platform-side ID; direct inquiries are manual and
  may legitimately have NULL).
- ``gut_rating`` 1-5 if present.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.inquiry_enums import INQUIRY_SOURCES

_NAME_MAX = 255
_EMAIL_MAX = 255
_PHONE_MAX = 50
_EMPLOYER_MAX = 255
_NOTES_MAX = 5000
_EXT_ID_MAX = 100
_EMAIL_MSG_ID_MAX = 255


class InquiryCreateRequest(BaseModel):
    """Body for POST /inquiries.

    ``organization_id`` and ``user_id`` are NOT accepted — they're resolved
    server-side from the request context. ``stage`` is forced to ``'new'`` on
    create (subsequent stage transitions go through PATCH).
    """

    listing_id: uuid.UUID | None = None

    source: str
    external_inquiry_id: str | None = Field(default=None, max_length=_EXT_ID_MAX)

    inquirer_name: str | None = Field(default=None, max_length=_NAME_MAX)
    inquirer_email: str | None = Field(default=None, max_length=_EMAIL_MAX)
    inquirer_phone: str | None = Field(default=None, max_length=_PHONE_MAX)
    inquirer_employer: str | None = Field(default=None, max_length=_EMPLOYER_MAX)

    desired_start_date: _dt.date | None = None
    desired_end_date: _dt.date | None = None

    gut_rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = Field(default=None, max_length=_NOTES_MAX)

    received_at: _dt.datetime
    email_message_id: str | None = Field(default=None, max_length=_EMAIL_MSG_ID_MAX)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "InquiryCreateRequest":
        if self.source not in INQUIRY_SOURCES:
            raise ValueError(
                f"source must be one of {INQUIRY_SOURCES}, got {self.source!r}",
            )
        # FF / TNH / other inquiries always carry a platform-side ID. Only
        # 'direct' (manual host-entered) is allowed to omit it.
        if self.source != "direct" and not self.external_inquiry_id:
            raise ValueError(
                f"external_inquiry_id is required when source is {self.source!r}",
            )
        if (
            self.desired_start_date is not None
            and self.desired_end_date is not None
            and self.desired_start_date > self.desired_end_date
        ):
            raise ValueError("desired_start_date cannot be after desired_end_date")
        return self
