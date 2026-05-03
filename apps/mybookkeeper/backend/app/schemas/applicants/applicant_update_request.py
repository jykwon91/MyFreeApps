"""Pydantic schema for PATCH /applicants/{applicant_id} — contract date update.

Only ``contract_start`` and ``contract_end`` are accepted in this request.
Both fields are optional — a partial update (e.g. only updating ``contract_end``)
is fully supported. Omitting a field entirely means "leave it unchanged".

Cross-field validation: if both dates are provided, ``contract_end`` must be
strictly after ``contract_start``. If only one is provided, no cross-field
check is possible (we don't know what the current DB value of the other field
is here), so that check is delegated to the service layer if needed.

``extra="forbid"`` ensures attackers cannot inject unexpected fields.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, model_validator


class ApplicantUpdateRequest(BaseModel):
    contract_start: _dt.date | None = None
    contract_end: _dt.date | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def check_end_after_start(self) -> "ApplicantUpdateRequest":
        if self.contract_start is not None and self.contract_end is not None:
            if self.contract_end <= self.contract_start:
                raise ValueError(
                    "contract_end must be after contract_start"
                )
        return self
