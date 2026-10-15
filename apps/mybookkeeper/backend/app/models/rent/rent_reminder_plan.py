"""How and when one tenant is reminded that rent is due.

Reminders only: nothing here knows about payments or balances. The amount in a
reminder comes from the tenant's ``rent_schedules`` (see
``rent_reminder_math``), and the reminder cadence is deliberately separate from
the schedule's obligation cadence — the same distinction ``rent_schedules``
already draws between what is owed and how often the tenant pays. That is why
there is no payment-cadence column on ``rent_schedules``: it lives here, on the
thing that actually acts on it.

``payment_instructions`` is per plan because MBK has no organization-level
settings surface to hang it on; one live plan per tenant keeps it a single
edit in practice.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.rent_reminder_constants import (
    DEFAULT_REMINDER_SEND_TIME,
    DEFAULT_REMINDER_TIMEZONE,
    MAX_SEND_DAYS_BEFORE,
)
from app.core.rent_reminder_enums import RENT_REMINDER_FREQUENCIES_SQL
from app.db.base import Base


class RentReminderPlan(Base):
    __tablename__ = "rent_reminder_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        nullable=False,
    )

    frequency: Mapped[str] = mapped_column(String(12), nullable=False)
    # 0 = Monday … 6 = Sunday (Python's ``date.weekday()``). Weekly plans only.
    due_weekday: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    send_days_before: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )
    # Local wall-clock time in ``timezone``.
    send_time: Mapped[_dt.time] = mapped_column(
        Time, nullable=False, default=DEFAULT_REMINDER_SEND_TIME,
        server_default=text("'18:00:00'"),
    )
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default=DEFAULT_REMINDER_TIMEZONE,
        server_default=DEFAULT_REMINDER_TIMEZONE,
    )

    email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true",
    )
    sms_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )

    # When set, every reminder states this amount instead of the computed one.
    amount_override: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    payment_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true",
    )

    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"frequency IN {RENT_REMINDER_FREQUENCIES_SQL}",
            name="chk_rent_reminder_plan_frequency",
        ),
        # A weekly plan needs its weekday; a monthly plan follows the charge's
        # own due date and must not carry a stray one.
        CheckConstraint(
            "(frequency = 'weekly' AND due_weekday IS NOT NULL) OR "
            "(frequency = 'monthly' AND due_weekday IS NULL)",
            name="chk_rent_reminder_plan_weekday_matches_frequency",
        ),
        CheckConstraint(
            "due_weekday IS NULL OR (due_weekday >= 0 AND due_weekday <= 6)",
            name="chk_rent_reminder_plan_weekday_range",
        ),
        CheckConstraint(
            f"send_days_before >= 0 AND send_days_before <= {MAX_SEND_DAYS_BEFORE}",
            name="chk_rent_reminder_plan_send_days_range",
        ),
        CheckConstraint(
            "amount_override IS NULL OR amount_override > 0",
            name="chk_rent_reminder_plan_override_positive",
        ),
        # One live plan per tenant.
        Index(
            "uq_rent_reminder_plans_applicant_live",
            "applicant_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_rent_reminder_plans_org_active",
            "organization_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
