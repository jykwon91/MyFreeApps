"""Payload for creating or replacing a tenant's rent-reminder plan.

Create (POST) and update (PUT) take the whole plan: the settings form always
shows every field, and the cross-field rules below (weekday vs frequency, how
far ahead a weekly reminder may go) are only checkable on a complete plan.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.rent_reminder_constants import (
    DEFAULT_REMINDER_SEND_TIME,
    DEFAULT_REMINDER_TIMEZONE,
    MAX_SEND_DAYS_BEFORE,
    SEND_WINDOW_END,
    SEND_WINDOW_START,
)
from app.core.rent_reminder_enums import RENT_REMINDER_FREQUENCIES
from app.schemas.rent.rent_money import validate_money

_MAX_INSTRUCTIONS_LENGTH = 500
# A weekly reminder more than six days ahead would land before the previous
# week's due date, which is never what anyone means.
_MAX_WEEKLY_SEND_DAYS_BEFORE = 6


class RentReminderPlanRequest(BaseModel):
    frequency: str
    due_weekday: int | None = Field(default=None, ge=0, le=6)
    send_days_before: int = Field(ge=0, le=MAX_SEND_DAYS_BEFORE)
    send_time: _dt.time = DEFAULT_REMINDER_SEND_TIME
    timezone: str = DEFAULT_REMINDER_TIMEZONE
    email_enabled: bool = True
    sms_enabled: bool = False
    amount_override: Decimal | None = None
    payment_instructions: str | None = Field(default=None, max_length=_MAX_INSTRUCTIONS_LENGTH)
    is_active: bool = True

    @field_validator("frequency")
    @classmethod
    def _check_frequency(cls, v: str) -> str:
        if v not in RENT_REMINDER_FREQUENCIES:
            raise ValueError(f"frequency must be one of {', '.join(RENT_REMINDER_FREQUENCIES)}")
        return v

    @field_validator("send_time")
    @classmethod
    def _check_send_time(cls, v: _dt.time) -> _dt.time:
        if not (SEND_WINDOW_START <= v < SEND_WINDOW_END):
            raise ValueError("reminders can only be sent between 9:00am and 8:00pm")
        return v.replace(second=0, microsecond=0, tzinfo=None)

    @field_validator("timezone")
    @classmethod
    def _check_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("unknown timezone") from exc
        return v

    @field_validator("amount_override")
    @classmethod
    def _check_override(cls, v: Decimal | None) -> Decimal | None:
        if v is None:
            return None
        validate_money(v)
        if v == 0:
            raise ValueError("amount override must be more than zero")
        return v

    @field_validator("payment_instructions")
    @classmethod
    def _blank_is_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        return stripped or None

    @model_validator(mode="after")
    def _check_cross_fields(self) -> RentReminderPlanRequest:
        if self.frequency == "weekly":
            if self.due_weekday is None:
                raise ValueError("a weekly reminder needs the day rent is due")
            if self.send_days_before > _MAX_WEEKLY_SEND_DAYS_BEFORE:
                raise ValueError("a weekly reminder can go out at most 6 days ahead")
        elif self.due_weekday is not None:
            raise ValueError("a monthly reminder follows the rent due date; leave the weekday empty")
        if not (self.email_enabled or self.sms_enabled):
            raise ValueError("turn on email or text so the reminder has somewhere to go")
        return self
