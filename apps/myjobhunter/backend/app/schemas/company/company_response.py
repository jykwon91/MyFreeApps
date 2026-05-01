"""Pydantic schema for a Company response.

Used by GET /companies, POST /companies, GET /companies/{id}.

Server-managed columns (``id``, ``user_id``, ``created_at``, ``updated_at``)
are exposed read-only. Tenant scoping is enforced at the repository layer;
the response includes ``user_id`` so callers can verify ownership without
an extra round-trip.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class CompanyResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID

    name: str
    primary_domain: str | None = None
    logo_url: str | None = None
    industry: str | None = None
    size_range: str | None = None
    hq_location: str | None = None
    description: str | None = None
    external_ref: str | None = None
    external_source: str | None = None
    crunchbase_id: str | None = None

    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
