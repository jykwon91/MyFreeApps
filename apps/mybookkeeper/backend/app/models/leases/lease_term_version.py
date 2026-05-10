"""A versioned record of a signed lease's effective term (starts_on / ends_on).

The seed row (``source_attachment_id IS NULL``) captures the lease's original
term as signed. Each subsequent row records an extension addendum: a new
``ends_on`` plus a pointer to the addendum attachment that produced it.

Soft-deleted via ``deleted_at`` so an extension can be undone within the
30-day window without losing the audit trail. The repo / service layer is
responsible for recomputing ``signed_leases.ends_on`` from the latest
non-deleted version after an undo.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeaseTermVersion(Base):
    __tablename__ = "lease_term_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_leases.id", ondelete="CASCADE"),
        nullable=False,
    )

    starts_on: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[_dt.date] = mapped_column(Date, nullable=False)

    # NULL on the seed row (the original term, no addendum). Set to the
    # signed_lease_attachments row that captures the rendered/signed
    # extension addendum for every extension version.
    source_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_lease_attachments.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    # Soft-delete used by the 30-day extension undo path. Seed rows must
    # never be soft-deleted (the partial unique index below enforces that
    # exactly one live seed exists per lease).
    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        # One version per addendum (idempotency: re-uploading the same
        # addendum file does not create a duplicate version row). Partial
        # so the seed row (source_attachment_id IS NULL) is excluded —
        # otherwise two NULL seed rows on the same lease would collide
        # only by accident of NULL semantics.
        Index(
            "uq_lease_term_versions_lease_attachment",
            "lease_id", "source_attachment_id",
            unique=True,
            postgresql_where=text("source_attachment_id IS NOT NULL"),
        ),
        # Exactly one live seed row per lease — guards the invariant that
        # a lease has a single canonical original term.
        Index(
            "uq_lease_term_versions_seed_per_lease",
            "lease_id",
            unique=True,
            postgresql_where=text(
                "source_attachment_id IS NULL AND deleted_at IS NULL"
            ),
        ),
        # Lookup the latest live version for a given lease.
        Index(
            "ix_lease_term_versions_lease_active",
            "lease_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
