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
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.inquiry_enums import (
    INQUIRY_EMPLOYMENT_STATUSES_SQL,
    INQUIRY_SOURCES_SQL,
    INQUIRY_SPAM_STATUSES_SQL,
    INQUIRY_STAGES_SQL,
    INQUIRY_SUBMITTED_VIA_SQL,
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

    # ----- Public inquiry form (T0) -----
    # Where the inquiry record came into MBK. Defaults to ``manual_entry`` for
    # pre-T0 rows; new manual + Gmail-OAuth + public-form inserts set this
    # explicitly. Used by the operator inbox to distinguish channels.
    submitted_via: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="manual_entry",
        server_default="manual_entry",
    )

    # Spam triage state. ``unscored`` for legacy rows + Gmail-parsed inquiries
    # that don't run the public-form filter pipeline. Public-form inquiries
    # always have one of {clean, flagged, spam, manually_cleared}. The operator
    # can override via "Mark as not spam" / "Mark as spam".
    spam_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="unscored",
        server_default="unscored",
    )
    # Final 0-100 score from ``inquiry_spam_service`` (Claude scoring step).
    # NULL when no Claude scoring has run (legacy / Gmail-parsed / hard-rejected
    # inquiries that never reached the scoring step).
    spam_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Public form fields — collected on the prospect-facing form. NULL on
    # Gmail-parsed and manually-entered inquiries.
    move_in_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    lease_length_months: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    occupant_count: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    has_pets: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    pets_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vehicle_count: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    current_city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # ISO 3166-1 alpha-2 country code (e.g. "US", "CA", "MX"). NULL on
    # legacy rows pre-dating the city/state split.
    current_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    # State / province / region. For US country, holds the 2-letter state
    # code (validated by the schema's cross-field check). For non-US
    # countries, free text up to 100 chars.
    current_region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    employment_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    why_this_room: Mapped[str | None] = mapped_column(Text, nullable=True)
    additional_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Submitter context — captured server-side for audit + abuse triage.
    # ``client_ip`` is INET on PostgreSQL so range queries (``<<= '1.2.3.0/24'``)
    # work directly; on SQLite (tests) it falls back to a string column.
    client_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
        CheckConstraint(
            f"submitted_via IN {INQUIRY_SUBMITTED_VIA_SQL}",
            name="chk_inquiry_submitted_via",
        ),
        CheckConstraint(
            f"spam_status IN {INQUIRY_SPAM_STATUSES_SQL}",
            name="chk_inquiry_spam_status",
        ),
        CheckConstraint(
            f"employment_status IS NULL OR employment_status IN {INQUIRY_EMPLOYMENT_STATUSES_SQL}",
            name="chk_inquiry_employment_status",
        ),
        CheckConstraint(
            "spam_score IS NULL OR (spam_score >= 0 AND spam_score <= 100)",
            name="chk_inquiry_spam_score_range",
        ),
        CheckConstraint(
            "lease_length_months IS NULL OR (lease_length_months BETWEEN 1 AND 24)",
            name="chk_inquiry_lease_length_months",
        ),
        CheckConstraint(
            "occupant_count IS NULL OR (occupant_count BETWEEN 1 AND 10)",
            name="chk_inquiry_occupant_count",
        ),
        CheckConstraint(
            "vehicle_count IS NULL OR (vehicle_count BETWEEN 0 AND 10)",
            name="chk_inquiry_vehicle_count",
        ),
        # Inbox spam-tab filter — covers (org, spam_status) for active rows.
        Index(
            "ix_inquiries_org_spam_active",
            "organization_id", "spam_status",
            postgresql_where=text("deleted_at IS NULL"),
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
