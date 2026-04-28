"""Pydantic schema for POST /applicants/promote/{inquiry_id}.

All fields are optional. The promotion service auto-fills missing values
from the source inquiry where possible (legal_name, employer_or_hospital,
contract dates) — fields with no inquiry source (dob, vehicle_make_model,
smoker, pets, referred_by) come from this payload only.

Validators:
- ``contract_end >= contract_start`` when both set.
- ``dob`` must place the applicant at or above ``APPLICANT_MINIMUM_AGE_YEARS``
  on the day of promotion. Violations raise 422 — never silently coerce.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.applicant_constants import (
    APPLICANT_EMPLOYER_MAX,
    APPLICANT_LEGAL_NAME_MAX,
    APPLICANT_MINIMUM_AGE_YEARS,
    APPLICANT_PETS_MAX,
    APPLICANT_REFERRED_BY_MAX,
    APPLICANT_VEHICLE_MAX,
)


class ApplicantPromoteRequest(BaseModel):
    """Body for POST /applicants/promote/{inquiry_id}.

    Auto-fill behaviour (handled by ``promote_service``):
    - ``legal_name`` falls back to the inquiry's ``inquirer_name``.
    - ``employer_or_hospital`` falls back to the inquiry's ``inquirer_employer``.
    - ``contract_start`` / ``contract_end`` fall back to the inquiry's
      ``desired_start_date`` / ``desired_end_date``.
    - All other fields default to ``None`` and stay ``None`` if the host
      didn't supply them.
    """

    legal_name: str | None = Field(default=None, max_length=APPLICANT_LEGAL_NAME_MAX)
    dob: _dt.date | None = None
    employer_or_hospital: str | None = Field(
        default=None, max_length=APPLICANT_EMPLOYER_MAX,
    )

    contract_start: _dt.date | None = None
    contract_end: _dt.date | None = None

    vehicle_make_model: str | None = Field(
        default=None, max_length=APPLICANT_VEHICLE_MAX,
    )
    smoker: bool | None = None
    pets: str | None = Field(default=None, max_length=APPLICANT_PETS_MAX)
    referred_by: str | None = Field(default=None, max_length=APPLICANT_REFERRED_BY_MAX)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ApplicantPromoteRequest":
        if (
            self.contract_start is not None
            and self.contract_end is not None
            and self.contract_end < self.contract_start
        ):
            raise ValueError("contract_end cannot be before contract_start")

        if self.dob is not None:
            today = _dt.date.today()
            # Compute age the way humans do — has the birthday already
            # passed this year? If not, subtract one.
            age = today.year - self.dob.year - (
                (today.month, today.day) < (self.dob.month, self.dob.day)
            )
            if age < APPLICANT_MINIMUM_AGE_YEARS:
                raise ValueError(
                    f"applicant must be at least {APPLICANT_MINIMUM_AGE_YEARS} "
                    "years old on the day of promotion",
                )
        return self
