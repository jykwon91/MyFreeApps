"""ProfileResponse schema — full read shape for GET /profile and PATCH /profile.

Mirrors all writable + readable fields on the Profile model.
Server-managed columns (id, user_id, created_at, updated_at) are exposed
read-only. The caller never sets these.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ProfileResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID

    # Resume metadata (Phase 3 upload — not writable here)
    resume_file_path: str | None = None
    parser_version: str | None = None
    parsed_at: datetime | None = None

    # Work auth
    work_auth_status: str

    # Salary preferences
    desired_salary_min: Decimal | None = None
    desired_salary_max: Decimal | None = None
    salary_currency: str
    salary_period: str

    # Location preferences
    locations: list[str]
    remote_preference: str

    # Professional meta
    seniority: str | None = None
    summary: str | None = None
    timezone: str | None = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
