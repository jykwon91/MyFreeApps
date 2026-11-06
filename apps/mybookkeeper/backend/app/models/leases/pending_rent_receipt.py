"""Pending rent receipt queue row.

When a transaction is attributed to a tenant (auto_exact or confirmed fuzzy),
a row is created here so the host can review and send a PDF receipt without
having to hunt for the transaction manually.

Status transitions:
  pending  → sending    (a send claimed the row; only one request can win)
  sending  → sent       (Gmail accepted the email)
  sending  → pending    (Gmail definitely did not send; the claim is released)
  pending  → dismissed  (host explicitly skipped this receipt)

A row stays ``sending`` when Gmail's answer was unknown. The next send attempt
after ``GMAIL_SEND_CLAIM_STALE_AFTER`` looks the email up in Gmail by
``send_message_id`` and either marks it sent or releases the claim.

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
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base

PENDING_RENT_RECEIPT_STATUSES: tuple[str, ...] = ("pending", "sending", "sent", "dismissed")
# Still needs the host: not sent yet, or sent with the outcome unconfirmed.
OPEN_RECEIPT_STATUSES: tuple[str, ...] = ("pending", "sending")


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

    # Default period is the calendar month of the transaction date, clipped to
    # the covering lease's term so a move-in/move-out month reports only the
    # days under lease (see ``receipt_period_resolver``). Host can override in
    # the SendReceiptDialog before sending.
    period_start_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    period_end_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending",
    )

    sent_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # The RFC 822 Message-ID of the current (or last) send attempt. Kept after
    # ``sent`` as the link to the email in the host's Sent folder.
    send_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    send_claimed_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # FK to the signed_lease_attachment row for the current send attempt. It is
    # created before the email goes out, so it only means "sent" once
    # ``status == 'sent'``. SET NULL — if the attachment is later deleted we
    # keep the receipt queue row as a historical record.
    sent_via_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signed_lease_attachments.id", ondelete="SET NULL"),
        nullable=True,
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
    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'sending', 'sent', 'dismissed')",
            name="chk_pending_rent_receipt_status",
        ),
        CheckConstraint(
            "status <> 'sending' OR (send_message_id IS NOT NULL AND send_claimed_at IS NOT NULL)",
            name="chk_pending_rent_receipt_sending_claim",
        ),
        # ``chk_pending_rent_receipt_sending_account`` (status <> 'sending' OR sender_gmail_address
        # IS NOT NULL) exists only in the database, added NOT VALID by migration
        # sendclaimacct261106: claims from before the address was recorded have
        # none, and the tests need to create such claims.
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
