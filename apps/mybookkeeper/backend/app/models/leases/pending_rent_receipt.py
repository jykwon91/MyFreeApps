"""Pending rent receipt queue row.

When a transaction is attributed to a tenant (auto_exact or confirmed fuzzy),
a row is created here so the host can review and send a PDF receipt without
having to hunt for the transaction manually.

Status transitions:
  pending  → sent       (host sent the PDF via SendReceiptDialog)
  pending  → dismissed  (host explicitly skipped this receipt)

The row is NEVER deleted — it is the audit record for whether a receipt
was sent or skipped. Soft-delete is intentionally omitted (receipts are
permanent records; there is nothing to soft-delete here).
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
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

PENDING_RENT_RECEIPT_STATUSES: tuple[str, ...] = ("pending", "sent", "dismissed")


class PendingRentReceipt(Base):
    __tablename__ = "pending_rent_receipts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # UNIQUE — one pending receipt per transaction at most.
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SET NULL — the receipt queue row survives if the signed lease is deleted,
    # so we don't silently lose pending items.
    signed_lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_leases.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Default period is the calendar month of the transaction date; host can
    # override in the SendReceiptDialog before sending.
    period_start_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    period_end_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending",
    )

    sent_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # FK to the signed_lease_attachment row created when the receipt PDF was
    # uploaded after sending. SET NULL — if the attachment is later deleted
    # we keep the receipt queue row as a historical record.
    sent_via_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_lease_attachments.id", ondelete="SET NULL"),
        nullable=True,
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
    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'sent', 'dismissed')",
            name="chk_pending_rent_receipt_status",
        ),
        # Fast lookup for the sidebar badge count and pending-receipts page.
        Index(
            "ix_pending_rent_receipts_org_status",
            "organization_id", "status",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # For looking up a pending receipt from a transaction (used on the
        # Transactions page "Receipt sent" pill query).
        Index(
            "ix_pending_rent_receipts_transaction_id",
            "transaction_id",
        ),
    )
