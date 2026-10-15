"""One reminder, on one channel, for one due date — the append-only send log.

``UNIQUE (plan_id, due_date, channel)`` is the idempotency key: a tick that runs
twice, a scheduler restart, or "send now" racing a tick can never produce a
second row, so a tenant can never get the same reminder twice. A row is claimed
(status ``queued``) and committed *before* the provider is called, so a crash
mid-send leaves a ``queued`` row that the watchdog fails and reports — a missed
reminder the operator hears about, rather than a silent duplicate.

Rows are never deleted. ``message_body`` names the tenant, so it is encrypted
at rest like the applicant's own ``legal_name``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.rent_reminder_enums import (
    RENT_REMINDER_CHANNELS_SQL,
    RENT_REMINDER_EMAIL_STATUSES_SQL,
    RENT_REMINDER_PENDING_STATUSES_SQL,
    RENT_REMINDER_SEND_STATUSES_SQL,
)
from app.db.base import Base


class RentReminderSend(Base):
    __tablename__ = "rent_reminder_sends"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rent_reminder_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    due_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    channel: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    message_body: Mapped[str] = mapped_column(EncryptedString(2000), nullable=False)
    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    # httpSMS message id (sms only). Webhooks are matched on our own row id,
    # sent as httpSMS's ``request_id``; this is the fallback and the audit link.
    provider_message_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    # When the message left MBK (SMTP accepted / httpSMS accepted).
    sent_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # When the phone confirmed the text went out (or was delivered).
    confirmed_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # Set once the operator has been emailed about this row's failure, so the
    # alert is sent at most once per row.
    operator_alerted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "plan_id", "due_date", "channel", name="uq_rent_reminder_sends_plan_due_channel",
        ),
        CheckConstraint(
            f"channel IN {RENT_REMINDER_CHANNELS_SQL}",
            name="chk_rent_reminder_send_channel",
        ),
        CheckConstraint(
            f"status IN {RENT_REMINDER_SEND_STATUSES_SQL}",
            name="chk_rent_reminder_send_status",
        ),
        # Phone-only states never appear on an email row.
        CheckConstraint(
            f"channel = 'sms' OR status IN {RENT_REMINDER_EMAIL_STATUSES_SQL}",
            name="chk_rent_reminder_send_status_matches_channel",
        ),
        CheckConstraint("amount >= 0", name="chk_rent_reminder_send_amount_non_negative"),
        # History for one tenant, newest first.
        Index("ix_rent_reminder_sends_applicant_created", "applicant_id", "created_at"),
        Index("ix_rent_reminder_sends_org", "organization_id"),
        Index("ix_rent_reminder_sends_provider_message_id", "provider_message_id"),
        # Watchdog sweep — only rows still owed an outcome.
        Index(
            "ix_rent_reminder_sends_pending",
            "created_at",
            postgresql_where=text(f"status IN {RENT_REMINDER_PENDING_STATUSES_SQL}"),
        ),
    )
