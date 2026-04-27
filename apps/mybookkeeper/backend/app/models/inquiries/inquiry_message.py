"""SQLAlchemy ORM model for ``inquiry_messages``.

Per RENTALS_PLAN.md §5.2:
- One row per email received / sent.
- Immutable after insert — no service-level update flow exists. Rewriting
  raw_email_body is forbidden because the audit trail must reflect what was
  actually received.
- ``from_address`` / ``to_address`` are PII — encrypted via EncryptedString.
- The covering index ``(inquiry_id, created_at DESC)`` powers the lateral-join
  inbox query (see ``inquiry_repo.list_with_last_message``).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.inquiry_enums import (
    INQUIRY_MESSAGE_CHANNELS_SQL,
    INQUIRY_MESSAGE_DIRECTIONS_SQL,
)
from app.db.base import Base


class InquiryMessage(Base):
    __tablename__ = "inquiry_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)

    from_address: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    to_address: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_email_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    sent_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"direction IN {INQUIRY_MESSAGE_DIRECTIONS_SQL}",
            name="chk_inquiry_message_direction",
        ),
        CheckConstraint(
            f"channel IN {INQUIRY_MESSAGE_CHANNELS_SQL}",
            name="chk_inquiry_message_channel",
        ),
        # Covering index for the inbox lateral join — most-recent message per inquiry.
        Index(
            "ix_inquiry_messages_inquiry_created",
            "inquiry_id", "created_at",
        ),
        # Lookup-by-message-id for email-parser dedup (PR 2.2).
        Index(
            "ix_inquiry_messages_email_message_id",
            "email_message_id",
        ),
    )
