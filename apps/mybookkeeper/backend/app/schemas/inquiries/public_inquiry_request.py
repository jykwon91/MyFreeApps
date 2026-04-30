"""Pydantic schema for ``POST /api/inquiries/public`` (T0).

The body of the public inquiry form. All length / range constraints are
enforced server-side so a hand-crafted curl can't bypass the frontend rules.

The ``website`` field is the honeypot — visually hidden in the form but real
in the schema so bots that fill every field flip the spam triage.

The ``form_loaded_at`` field is the JS timestamp captured when the form
mounted; the backend compares it to ``now()`` to identify <5s submissions.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.inquiry_enums import INQUIRY_EMPLOYMENT_STATUSES

_NAME_MAX = 200
_PHONE_MAX = 50
_CITY_MAX = 200
_FREE_TEXT_MAX = 2000


class PublicInquiryRequest(BaseModel):
    """Body for the public inquiry form. Untrusted — all validation is here."""

    listing_slug: str = Field(min_length=1, max_length=220)

    name: str = Field(min_length=1, max_length=_NAME_MAX)
    # ``EmailStr`` runs format validation via the ``email-validator`` package
    # (already a transitive dep through fastapi-users). On invalid input,
    # Pydantic returns a 422 — the public route maps that to a generic 400.
    email: EmailStr
    phone: str = Field(min_length=7, max_length=_PHONE_MAX)

    move_in_date: _dt.date
    lease_length_months: int = Field(ge=1, le=24)
    occupant_count: int = Field(ge=1, le=10)
    has_pets: bool
    pets_description: str | None = Field(default=None, max_length=_FREE_TEXT_MAX)
    vehicle_count: int = Field(ge=0, le=10)
    current_city: str = Field(min_length=1, max_length=_CITY_MAX)
    employment_status: str
    why_this_room: str = Field(max_length=_FREE_TEXT_MAX)
    additional_notes: str | None = Field(default=None, max_length=_FREE_TEXT_MAX)

    # ``form_loaded_at`` is a millisecond timestamp captured client-side at
    # form mount. The submit-timing filter (step 4) compares it with the
    # server's now(). Bots that POST instantly skip the JS that sets this.
    form_loaded_at: int = Field(ge=0)

    # Honeypot — visually hidden in the rendered form, so legitimate users
    # never type into it. Bots that auto-fill every text input trip the gate.
    website: str = Field(default="", max_length=500)

    # Cloudflare Turnstile token. Empty in dev/CI mode (the verify helper
    # short-circuits when ``settings.turnstile_secret_key`` is empty).
    turnstile_token: str = Field(default="", max_length=2048)

    model_config = ConfigDict(extra="forbid")


# Lightweight error returned by the schema-validation step that we want to
# surface as a friendly hint (vs. the generic "Something went wrong" we
# return for every other filter failure). Currently only ``why_this_room``
# minimum length triggers this — the soft anti-spam gate that bots fail.
PUBLIC_INQUIRY_FRIENDLY_ERROR_TELL_MORE = (
    "Please tell us a bit more about why you're interested."
)


def is_valid_employment_status(value: str) -> bool:
    """Whether ``value`` is one of the allowlisted employment statuses.

    Done here (not in the schema) so the route can return the same generic
    400 for every domain failure — leaking allowed-values would help spammers
    write bots that match the dropdown perfectly.
    """
    return value in INQUIRY_EMPLOYMENT_STATUSES
