"""One reminder, on one channel, for one due date — the append-only send log.

``UNIQUE (plan_id, due_date, channel)`` is the idempotency key: a tick that runs
twice, a scheduler restart, or "send now" racing a tick can never produce a
second row, so a tenant can never get the same reminder twice. A row is claimed
(status ``queued``) and committed *before* the provider is called, so a crash
mid-send leaves a ``queued`` row that the watchdog fails and reports — a missed
reminder the operator hears about, rather than a silent duplicate.

Rows are never deleted. ``message_body`` names the tenant, so it is encrypted
at rest like the applicant's own ``legal_name``.

``recipient_phone_hash`` is the keyed lookup code (``app.core.security.
phone_lookup_hash``) of the number a text was sent to, so a tenant's reply can
be matched to the account that texted it without decrypting any phone number.
Codes older than ``REPLY_MATCH_WINDOW_DAYS`` are kept but never matched. A
retention job that purges a tenant's details must null their codes too.
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
from app.core.rent_reminder_channel import RentReminderChannel
from app.core.rent_reminder_constants import (
    MAX_ERROR_CODE_LENGTH,
    MAX_PROVIDER_MESSAGE_ID_LENGTH,
    PHONE_LOOKUP_HASH_LENGTH,
)
from app.core.rent_reminder_enums import (
    RENT_REMINDER_CHANNEL_SMS,
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
    channel: Mapped[RentReminderChannel] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    message_body: Mapped[str] = mapped_column(EncryptedString(2000), nullable=False)
    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    # Which try this row is on: a retry reuses the row and adds one. Carried on
    # the text's Twilio status-callback URL as ``request_id``
    # (``<id>:<attempt>``) so news about an earlier try is told apart and ignored.
    attempt: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )
    # Twilio Message SID (sms only) for the current try. Callbacks are matched
    # on our own ``request_id``; this is the fallback and the audit link.
    provider_message_id: Mapped[str | None] = mapped_column(
        String(MAX_PROVIDER_MESSAGE_ID_LENGTH), nullable=True,
    )
    error_code: Mapped[str | None] = mapped_column(String(MAX_ERROR_CODE_LENGTH), nullable=True)
    # Lookup code of the number the current try texts (lowercase hex
    # HMAC-SHA256 of its E.164 form). Texts only; NULL for email, for a number
    # that can't be texted, and for texts from before replies were forwarded.
    recipient_phone_hash: Mapped[str | None] = mapped_column(
        String(PHONE_LOOKUP_HASH_LENGTH), nullable=True,
    )

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    # When the message left MBK (SMTP accepted / Twilio accepted).
    sent_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # When Twilio confirmed the text went out (or was delivered).
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
        # Text-only states never appear on an email row.
        CheckConstraint(
            f"channel = '{RENT_REMINDER_CHANNEL_SMS}' OR status IN {RENT_REMINDER_EMAIL_STATUSES_SQL}",
            name="chk_rent_reminder_send_status_matches_channel",
        ),
        CheckConstraint("amount >= 0", name="chk_rent_reminder_send_amount_non_negative"),
        CheckConstraint("attempt >= 1", name="chk_rent_reminder_send_attempt_positive"),
        CheckConstraint(
            "channel = 'sms' OR recipient_phone_hash IS NULL",
            name="chk_rent_reminder_send_phone_hash_sms_only",
        ),
        CheckConstraint(
            f"recipient_phone_hash IS NULL OR length(recipient_phone_hash) = {PHONE_LOOKUP_HASH_LENGTH}",
            name="chk_rent_reminder_send_phone_hash_length",
        ),
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
        # Matching a tenant's reply: the recent texts to one number.
        Index(
            "ix_rent_reminder_sends_recipient_phone_hash",
            "recipient_phone_hash",
            "created_at",
            postgresql_where=text("recipient_phone_hash IS NOT NULL"),
        ),
    )
