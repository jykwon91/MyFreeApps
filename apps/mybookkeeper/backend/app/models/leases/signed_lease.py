"""A lease record generated from a template for a specific applicant.

Named ``signed_leases`` (not ``leases``) because the codebase already uses
the table name ``leases`` for a separate financial-record concept under
``app/models/properties/lease.py``. The two domains are unrelated; this one
captures the document workflow (template + filled values + signed PDFs).

Soft-deleted because signed leases are legal records and retention is
mandatory even after operational deletion.
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
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.lease_enums import LEASE_KINDS_SQL, SIGNED_LEASE_STATUSES_SQL
from app.db.base import Base


class SignedLease(Base):
    __tablename__ = "signed_leases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # RESTRICT on template — preserve generated leases when a template is
    # soft-deleted. The application layer enforces "soft-delete blocked when
    # active leases reference this template" with a 409 response.
    # NULL is allowed for imported leases (kind='imported') that were signed
    # externally before MBK existed.
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lease_templates.id", ondelete="RESTRICT"),
        nullable=True,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # 'generated' = created via template substitution pipeline.
    # 'imported'  = uploaded externally-signed PDF(s) with no template.
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default="generated",
    )

    # The values dict the host filled in to drive substitution.
    # Keys map to LeaseTemplatePlaceholder.key.
    values: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}",
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", server_default="draft",
    )

    # Denormalised from ``values`` for index-friendly queries (date range).
    starts_on: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    generated_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    sent_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    signed_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    ended_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
            f"status IN {SIGNED_LEASE_STATUSES_SQL}",
            name="chk_signed_lease_status",
        ),
        CheckConstraint(
            f"kind IN {LEASE_KINDS_SQL}",
            name="chk_signed_lease_kind",
        ),
        # List page filter — newest active first per tenant.
        Index(
            "ix_signed_leases_org_created_active",
            "organization_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Pipeline status filter.
        Index(
            "ix_signed_leases_org_status_active",
            "organization_id", "status",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
