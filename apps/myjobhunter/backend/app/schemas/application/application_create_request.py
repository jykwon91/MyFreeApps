"""Pydantic schema for POST /applications request body.

Mirrors the writable columns on ``Application`` (``app/models/application/application.py``).
Server-managed columns (``id``, ``user_id``, ``created_at``, ``updated_at``,
``deleted_at``) are NOT accepted — they're either resolved from the request
context (``user_id``) or populated by the persistence layer.

``extra='forbid'`` defends against a malicious client trying to inject
``user_id`` via the body. The repository layer additionally applies an explicit
allowlist of writable columns as defense in depth.

Application status is NOT a column — per the project's
"No latest_status column" rule, status is computed from
``application_events`` via lateral join. ``archived`` is the only writable
state flag exposed here.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ApplicationSource, RemoteType, SalaryPeriod

# Bounds mirror the ``Application`` model's String() lengths.
_ROLE_TITLE_MAX_LEN = 200
_LOCATION_MAX_LEN = 200
_CURRENCY_LEN = 3
_EXTERNAL_REF_MAX_LEN = 255
_EXTERNAL_SOURCE_MAX_LEN = 50


class ApplicationCreateRequest(BaseModel):
    """Body for POST /applications.

    ``company_id`` is required — every application must point at a Company
    the operator owns. The service layer verifies the FK before persisting
    so cross-tenant references fail with HTTP 422 instead of a Postgres
    constraint error.
    """

    company_id: uuid.UUID
    role_title: str = Field(min_length=1, max_length=_ROLE_TITLE_MAX_LEN)

    url: str | None = None
    jd_text: str | None = None
    jd_parsed: dict | None = None

    source: str | None = None
    applied_at: _dt.datetime | None = None

    posted_salary_min: Decimal | None = Field(default=None, ge=0)
    posted_salary_max: Decimal | None = Field(default=None, ge=0)
    posted_salary_currency: str = Field(
        default="USD",
        min_length=_CURRENCY_LEN,
        max_length=_CURRENCY_LEN,
    )
    posted_salary_period: str | None = None

    location: str | None = Field(default=None, max_length=_LOCATION_MAX_LEN)
    remote_type: str = "unknown"

    fit_score: Decimal | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    archived: bool = False

    external_ref: str | None = Field(default=None, max_length=_EXTERNAL_REF_MAX_LEN)
    external_source: str | None = Field(default=None, max_length=_EXTERNAL_SOURCE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ApplicationCreateRequest":
        if self.source is not None and self.source not in ApplicationSource.ALL:
            raise ValueError(
                f"source must be one of {ApplicationSource.ALL}, got {self.source!r}",
            )
        if self.remote_type not in RemoteType.ALL:
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
