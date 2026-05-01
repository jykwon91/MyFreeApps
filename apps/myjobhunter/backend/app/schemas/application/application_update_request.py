"""Pydantic schema for PATCH /applications/{id} request body.

PATCH semantics — every field optional, only explicitly-provided fields are
applied. The repository layer applies an explicit allowlist on top of this
schema's ``extra='forbid'`` per the project rule:
"Always validate field names against an explicit allowlist before applying
dynamic updates."

``user_id`` and ``id`` are intentionally absent — they are not writable. The
``extra='forbid'`` config rejects any attempt to set them via the body with
HTTP 422.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ApplicationSource, RemoteType, SalaryPeriod

_ROLE_TITLE_MAX_LEN = 200
_LOCATION_MAX_LEN = 200
_CURRENCY_LEN = 3
_EXTERNAL_REF_MAX_LEN = 255
_EXTERNAL_SOURCE_MAX_LEN = 50


class ApplicationUpdateRequest(BaseModel):
    """Body for PATCH /applications/{id} — every field optional."""

    company_id: uuid.UUID | None = None
    role_title: str | None = Field(default=None, min_length=1, max_length=_ROLE_TITLE_MAX_LEN)

    url: str | None = None
    jd_text: str | None = None
    jd_parsed: dict | None = None

    source: str | None = None
    applied_at: _dt.datetime | None = None

    posted_salary_min: Decimal | None = Field(default=None, ge=0)
    posted_salary_max: Decimal | None = Field(default=None, ge=0)
    posted_salary_currency: str | None = Field(
        default=None,
        min_length=_CURRENCY_LEN,
        max_length=_CURRENCY_LEN,
    )
    posted_salary_period: str | None = None

    location: str | None = Field(default=None, max_length=_LOCATION_MAX_LEN)
    remote_type: str | None = None

    fit_score: Decimal | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    archived: bool | None = None

    external_ref: str | None = Field(default=None, max_length=_EXTERNAL_REF_MAX_LEN)
    external_source: str | None = Field(default=None, max_length=_EXTERNAL_SOURCE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ApplicationUpdateRequest":
        if self.source is not None and self.source not in ApplicationSource.ALL:
            raise ValueError(
                f"source must be one of {ApplicationSource.ALL}, got {self.source!r}",
            )
        if self.remote_type is not None and self.remote_type not in RemoteType.ALL:
            raise ValueError(
                f"remote_type must be one of {RemoteType.ALL}, got {self.remote_type!r}",
            )
        if (
            self.posted_salary_period is not None
            and self.posted_salary_period not in SalaryPeriod.ALL
        ):
            raise ValueError(
                f"posted_salary_period must be one of {SalaryPeriod.ALL}, "
                f"got {self.posted_salary_period!r}",
            )
        if (
            self.posted_salary_min is not None
            and self.posted_salary_max is not None
            and self.posted_salary_min > self.posted_salary_max
        ):
            raise ValueError(
                "posted_salary_min must be <= posted_salary_max",
            )
        return self

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields (Pydantic ``exclude_unset``).

        Used by the service layer to pass to ``application_repository.update`` —
        the repo layer applies the allowlist filter.
        """
        return self.model_dump(exclude_unset=True)
