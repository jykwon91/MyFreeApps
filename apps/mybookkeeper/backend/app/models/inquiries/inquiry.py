"""SQLAlchemy ORM model for ``inquiries``.

Per RENTALS_PLAN.md §5.2:
- PII columns (``inquirer_*``) use ``EncryptedString`` so they're stored as
  Fernet ciphertext and round-tripped to plaintext via the type decorator.
- ``key_version`` records which key generation encrypted the row's PII —
  required for non-destructive key rotation per §8.2.
- ``last_activity_at`` is intentionally absent — inbox sort uses a lateral
  join on ``inquiry_messages`` (see ``inquiry_repo.list_with_last_message``).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.inquiry_enums import (
    INQUIRY_SOURCES_SQL,
    INQUIRY_STAGES_SQL,
)
from app.db.base import Base


class Inquiry(Base):
    __tablename__ = "inquiries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    external_inquiry_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # PII — encrypted at rest via EncryptedString TypeDecorator.
    inquirer_name: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    inquirer_email: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    inquirer_phone: Mapped[str | None] = mapped_column(EncryptedString(50), nullable=True)
    inquirer_employer: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)

    desired_start_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    desired_end_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    stage: Mapped[str] = mapped_column(
        String(40), nullable=False, default="new", server_default="new",
    )
    gut_rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    received_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    email_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
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
            f"source IN {INQUIRY_SOURCES_SQL}",
            name="chk_inquiry_source",
        ),
        CheckConstraint(
            f"stage IN {INQUIRY_STAGES_SQL}",
            name="chk_inquiry_stage",
        ),
        CheckConstraint(
            "gut_rating IS NULL OR (gut_rating BETWEEN 1 AND 5)",
            name="chk_inquiry_gut_rating",
        ),
        # Inbox stage filter — covers (org, stage) for active rows.
        Index(
            "ix_inquiries_org_stage_active",
            "organization_id", "stage",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Inbox sort order — newest received first.
        Index(
            "ix_inquiries_org_received_active",
            "organization_id", "received_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # "All inquiries for this listing" lookup.
        Index(
            "ix_inquiries_org_listing",
            "organization_id", "listing_id",
        ),
        # Dedup partial UNIQUE — one Inquiry per Gmail message_id per user.
        Index(
            "uq_inquiries_user_email_message",
            "user_id", "email_message_id",
            unique=True,
            postgresql_where=text("email_message_id IS NOT NULL"),
        ),
        # Dedup partial UNIQUE — one Inquiry per (org, source, external_id).
        # Scoped per org so two orgs can independently track FF inquiry I-123.
        Index(
            "uq_inquiries_org_source_external",
            "organization_id", "source", "external_inquiry_id",
            unique=True,
            postgresql_where=text("external_inquiry_id IS NOT NULL"),
        ),
    )
