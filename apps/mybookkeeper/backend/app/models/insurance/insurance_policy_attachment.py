"""File attached to an insurance policy record.

Mirrors the ``signed_lease_attachment`` shape:
  storage_key + filename + content_type + size_bytes +
  uploaded_by_user_id + uploaded_at + kind discriminator.

Storage key partition: ``insurance-policies/{policy_id}/{attachment_id}``.
CASCADE-deleted with the parent policy; storage cleanup is best-effort
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

from app.core.insurance_enums import INSURANCE_ATTACHMENT_KINDS_SQL
from app.db.base import Base


class InsurancePolicyAttachment(Base):
    __tablename__ = "insurance_policy_attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("insurance_policies.id", ondelete="CASCADE"),
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
            f"kind IN {INSURANCE_ATTACHMENT_KINDS_SQL}",
            name="chk_insurance_policy_attachment_kind",
        ),
        Index("ix_insurance_policy_attachments_policy_id", "policy_id"),
    )
