"""Pydantic schema for PATCH /applicants/{applicant_id} — contract date update.

Only ``contract_start`` is accepted. ``contract_end`` is derived from the
latest signed lease's ``ends_on`` and is read-only on the applicant — the
host enters it when creating the lease draft, not on the applicant page.

``extra="forbid"`` ensures attackers cannot inject unexpected fields and
also catches stale frontend payloads that still ship ``contract_end``
(returns 422 with a clear field-not-allowed error rather than silently
ignoring the value).
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict


class ApplicantUpdateRequest(BaseModel):
    contract_start: _dt.date | None = None

    model_config = ConfigDict(extra="forbid")
