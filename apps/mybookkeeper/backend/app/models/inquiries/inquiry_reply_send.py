"""SQLAlchemy ORM model for ``inquiry_reply_sends`` — one claimed reply send.

``UNIQUE (inquiry_id, client_request_id)`` is the idempotency key. The website
and phone make one ``client_request_id`` per reply as written and send it with
every attempt, so a double tap, a retry after a lost response, or a second
device can never email the inquirer twice. The row is claimed (``sending``) and
committed before Gmail is called, with the RFC 822 ``Message-ID`` the reply is
sent with, so a send whose outcome is unknown can be settled later by looking
that Message-ID up in Gmail.

Kept apart from ``inquiry_messages`` on purpose: a message row means the reply
went out, and its readers (the timeline, the pet-disclosure check) rely on
that. A claim becomes ``sent`` in the same transaction that inserts its message.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.inquiry_enums import INQUIRY_REPLY_SEND_STATUSES_SQL
from app.db.base import Base


class InquiryReplySend(Base):
    __tablename__ = "inquiry_reply_sends"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # sha256 of the reply as submitted, so one key can't be reused for a different reply.
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    send_message_id: Mapped[str] = mapped_column(String(255), nullable=False)
    claimed_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    inquiry_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiry_messages.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
    )

    # The Gmail address the claim sent through. Settling compares it with the
    # connected account before searching, so a reconnect to another account
    # can't make an earlier send look unsent. Null on claims from before it was
    # recorded (settled against the connected account, as they always were).
    sender_gmail_address: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    key_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1, server_default="1")

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
        UniqueConstraint(
            "inquiry_id", "client_request_id", name="uq_inquiry_reply_sends_inquiry_request",
        ),
        CheckConstraint(
            f"status IN {INQUIRY_REPLY_SEND_STATUSES_SQL}",
            name="chk_inquiry_reply_send_status",
        ),
        # A sent claim always points at the message it recorded, and only then.
        CheckConstraint(
            "(status = 'sent') = (inquiry_message_id IS NOT NULL)",
            name="chk_inquiry_reply_send_sent_has_message",
        ),
        # ``chk_inquiry_reply_send_sending_account`` (status <> 'sending' OR sender_gmail_address
        # IS NOT NULL) exists only in the database, added NOT VALID by migration
        # sendclaimacct261106: claims from before the address was recorded have
        # none, and the tests need to create such claims.
    )
