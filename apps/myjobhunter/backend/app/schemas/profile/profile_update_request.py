"""PATCH /profile request body.

All fields optional — only explicitly-provided fields are applied.
``extra='forbid'`` prevents injection of server-managed columns (id, user_id).
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_WORK_AUTH_VALUES = frozenset({
    "citizen", "permanent_resident", "h1b", "tn", "opt", "other", "unknown",
})
_SALARY_PERIOD_VALUES = frozenset({"annual", "hourly", "monthly"})
_REMOTE_PREF_VALUES = frozenset({"remote_only", "hybrid", "onsite", "any"})
_SENIORITY_VALUES = frozenset({
    "junior", "mid", "senior", "staff", "principal", "manager", "director", "exec",
})
_CURRENCY_MAX = 3
_TIMEZONE_MAX = 50


class ProfileUpdateRequest(BaseModel):
    """Body for PATCH /profile — every field optional."""

    work_auth_status: str | None = Field(default=None)
    desired_salary_min: Decimal | None = None
    desired_salary_max: Decimal | None = None
    salary_currency: str | None = Field(default=None, max_length=_CURRENCY_MAX)
    salary_period: str | None = Field(default=None)
    locations: list[str] | None = Field(default=None, max_length=10)
    remote_preference: str | None = Field(default=None)
    seniority: str | None = Field(default=None)
    summary: str | None = None
    timezone: str | None = Field(default=None, max_length=_TIMEZONE_MAX)

    model_config = ConfigDict(extra="forbid")

    @field_validator("work_auth_status")
    @classmethod
    def validate_work_auth_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _WORK_AUTH_VALUES:
            raise ValueError(f"work_auth_status must be one of {sorted(_WORK_AUTH_VALUES)}")
        return v

    @field_validator("salary_period")
    @classmethod
    def validate_salary_period(cls, v: str | None) -> str | None:
        if v is not None and v not in _SALARY_PERIOD_VALUES:
            raise ValueError(f"salary_period must be one of {sorted(_SALARY_PERIOD_VALUES)}")
        return v

    @field_validator("remote_preference")
    @classmethod
    def validate_remote_preference(cls, v: str | None) -> str | None:
        if v is not None and v not in _REMOTE_PREF_VALUES:
            raise ValueError(f"remote_preference must be one of {sorted(_REMOTE_PREF_VALUES)}")
        return v

    @field_validator("seniority")
    @classmethod
    def validate_seniority(cls, v: str | None) -> str | None:
        if v is not None and v not in _SENIORITY_VALUES:
            raise ValueError(f"seniority must be one of {sorted(_SENIORITY_VALUES)}")
        return v

    def to_update_dict(self) -> dict[str, object]:
        """Return only explicitly-provided fields."""
        return self.model_dump(exclude_unset=True)
