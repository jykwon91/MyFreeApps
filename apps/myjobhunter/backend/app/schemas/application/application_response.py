"""Pydantic schema for an Application response (full payload).

Used by GET /applications/{id}, POST /applications, PATCH /applications/{id}.

Server-managed columns (``id``, ``user_id``, ``created_at``, ``updated_at``,
``deleted_at``) are exposed read-only. Tenant scoping is enforced at the
repository layer; the response includes ``user_id`` so callers can verify
ownership without an extra round-trip.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ApplicationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    company_id: uuid.UUID

    role_title: str
    url: str | None = None
    jd_text: str | None = None
    jd_parsed: dict | None = None

    source: str | None = None
    applied_at: _dt.datetime | None = None

    posted_salary_min: Decimal | None = None
    posted_salary_max: Decimal | None = None
    posted_salary_currency: str
    posted_salary_period: str | None = None

    location: str | None = None
    remote_type: str

    fit_score: Decimal | None = None
    notes: str | None = None
    archived: bool

    external_ref: str | None = None
    external_source: str | None = None

    deleted_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
