"""One dated obligation owed by a tenant.

Charges are *materialized*, not derived on the fly, so that each one is a
stable row a host can override, waive, annotate, or attach a late fee to. Rows
whose ``schedule_id`` is set were generated from that schedule and are
idempotent on ``(schedule_id, period_start)``; rows with a NULL ``schedule_id``
are one-offs the host entered by hand.

Payments are NOT stored here. They are the existing attributed
``transactions`` rows, and the mapping between the two is computed by the FIFO
allocator in ``rent_allocation`` rather than stored — it is a pure function of
(charges, payments), so persisting it would only create a second copy to go
stale whenever a payment is edited, re-attributed, or soft-deleted.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.rent_ledger_enums import RENT_CHARGE_TYPES_SQL
from app.db.base import Base


class RentCharge(Base):
    __tablename__ = "rent_charges"

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
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL for a one-off charge. SET NULL rather than CASCADE so deleting a
    # schedule never silently erases the history of what was already owed.
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rent_schedules.id", ondelete="SET NULL"),
        nullable=True,
    )

    charge_type: Mapped[str] = mapped_column(
        String(24), nullable=False, default="rent", server_default="rent",
    )

    # Inclusive on both ends, so consecutive generated periods tile exactly.
    period_start: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    period_end: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    due_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # A waived charge stays visible in the ledger for the audit trail but stops
    # counting toward the balance and is skipped by the allocator.
    waived_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    waived_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

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
            f"charge_type IN {RENT_CHARGE_TYPES_SQL}", name="chk_rent_charge_type",
        ),
        CheckConstraint("amount >= 0", name="chk_rent_charge_amount_non_negative"),
        CheckConstraint(
            "period_end >= period_start", name="chk_rent_charge_period_order",
        ),
        CheckConstraint(
            "(waived_at IS NULL) OR (waived_reason IS NOT NULL)",
            name="chk_rent_charge_waive_paired",
        ),
        # Idempotent generation: re-running the generator for a schedule never
        # duplicates a period. Partial so one-off charges (NULL schedule_id)
        # are excluded — a host may legitimately add two late fees on one day.
        Index(
            "uq_rent_charges_schedule_period",
            "schedule_id", "period_start",
            unique=True,
            postgresql_where=text("schedule_id IS NOT NULL AND deleted_at IS NULL"),
            sqlite_where=text("schedule_id IS NOT NULL AND deleted_at IS NULL"),
        ),
        # The ledger read: every live charge for one tenant in due order.
        Index(
            "ix_rent_charges_applicant_due",
            "applicant_id", "due_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Org-wide rent roll / arrears sweep.
        Index(
            "ix_rent_charges_org_due",
            "organization_id", "due_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_rent_charges_schedule_id", "schedule_id"),
    )
