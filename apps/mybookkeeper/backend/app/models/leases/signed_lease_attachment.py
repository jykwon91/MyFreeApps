"""File attached to a signed lease record.

Mirrors the ``listing_blackout_attachment`` shape (storage_key + filename +
content_type + size_bytes + uploaded_by_user_id + uploaded_at) and adds a
``kind`` discriminator so the UI can group rendered originals, signed PDFs,
inspections, addenda etc.

Storage: objects live in MinIO under ``signed-leases/<lease_id>/<id>``.
CASCADE-deleted with the parent signed lease; storage cleanup is best-effort
in the service layer.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.lease_enums import LEASE_ATTACHMENT_KINDS_SQL
from app.db.base import Base


class SignedLeaseAttachment(Base):
    __tablename__ = "signed_lease_attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_leases.id", ondelete="CASCADE"),
        nullable=False,
    )

    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)

    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    uploaded_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"kind IN {LEASE_ATTACHMENT_KINDS_SQL}",
            name="chk_signed_lease_attachment_kind",
        ),
        Index("ix_signed_lease_attachments_lease_id", "lease_id"),
    )
