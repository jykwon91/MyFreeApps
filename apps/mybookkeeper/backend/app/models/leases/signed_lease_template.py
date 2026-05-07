"""Join table linking a signed lease to one or more lease templates.

A signed lease can be generated from MULTIPLE templates in a single batch
(e.g. a master lease + an addendum + a community-rules sheet). Each row in
``signed_lease_templates`` records one template that contributed to the
lease, along with a ``display_order`` to preserve the host's pick order
when rendering / generating documents.

Cascade behaviour:
- ``ON DELETE CASCADE`` on ``lease_id`` — deleting (or hard-deleting) a
  signed lease drops its template links.
- ``ON DELETE RESTRICT`` on ``template_id`` — preserves links when a
  template is soft-deleted; the application enforces "soft-delete blocked
  when active leases reference this template" with a 409 response.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SignedLeaseTemplate(Base):
    __tablename__ = "signed_lease_templates"

    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_leases.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lease_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        PrimaryKeyConstraint(
            "lease_id", "template_id", name="pk_signed_lease_templates",
        ),
        # Speeds up has_active_lease_for_template + cascade reverse lookups.
        Index("ix_signed_lease_templates_template_id", "template_id"),
    )
