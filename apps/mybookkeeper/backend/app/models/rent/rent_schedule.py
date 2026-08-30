"""A recurring rent obligation for one tenant.

This is the "what is owed" side of the rent ledger. It exists because nothing
else in the schema records it: ``properties.Lease.monthly_rent`` hangs off the
vestigial ``properties.Tenant`` model that the live Tenants page does not use,
and ``signed_leases.values`` is free-form JSONB keyed by host-defined template
placeholders, so neither is a dependable structured source.

Keyed on ``applicant_id`` because that is what a tenant actually is in this
codebase (an Applicant at the ``lease_signed`` stage) and, critically, it is the
same key the attribution pipeline already writes onto ``transactions``. Charges
and payments therefore join directly with no bridging table.

The obligation cadence here is independent of how often the tenant pays. A
tenant on ``monthly`` who pays weekly is the case this domain exists for.
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
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.rent_ledger_enums import RENT_CADENCES_SQL
from app.db.base import Base


class RentSchedule(Base):
    __tablename__ = "rent_schedules"

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
    # The tenant. CASCADE: a deleted applicant's rent schedule is meaningless.
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Optional — lets a per-property rent roll aggregate without walking to the
    # applicant's inquiry. SET NULL so deleting a property preserves the ledger.
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Amount owed per period. Numeric(12,2) to match ``transactions.amount`` —
    # the ledger reconciles the two directly, and a cents-integer column here
    # would put a conversion between them on every comparison.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    cadence: Mapped[str] = mapped_column(String(12), nullable=False)

    # Periods tile forward from ``start_date``; see ``rent_period_math``.
    start_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    # NULL = open-ended. When set, the period containing it is prorated by
    # actual days and no later period is generated.
    end_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    # Days after a period's due date before an unpaid charge counts as overdue.
    # NULL — the default — means "not until the period itself ends", which is
    # the correct reading for a tenant paying more often than they are charged:
    # a monthly charge settled in weekly instalments is short for most of the
    # month by construction. A host who enforces a hard due date (rent due the
    # 1st, late after the 5th) sets this to 4.
    grace_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

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
            f"cadence IN {RENT_CADENCES_SQL}", name="chk_rent_schedule_cadence",
        ),
        # A zero-rent schedule is a legitimate concession (a comped month is
        # modelled by waiving the charge, but a comped *tenancy* is a 0 amount).
        CheckConstraint("amount >= 0", name="chk_rent_schedule_amount_non_negative"),
        CheckConstraint(
            "grace_days IS NULL OR grace_days >= 0",
            name="chk_rent_schedule_grace_non_negative",
        ),
        CheckConstraint(
            "end_date IS NULL OR end_date >= start_date",
            name="chk_rent_schedule_date_order",
        ),
        # A tenant may hold SEVERAL live schedules over time — a rent increase
        # at renewal is modelled by closing the current schedule's ``end_date``
        # and opening a new one the next day, so both rows stay live and
        # historical charges keep the rate they were generated at.
        #
        # The invariant that actually matters is that live schedules for one
        # applicant never *overlap* in time. That is a range constraint, not a
        # uniqueness one: expressing it in the database needs an EXCLUDE ...
        # USING gist over (applicant_id, daterange), which requires the
        # ``btree_gist`` extension and has no SQLite equivalent for the test
        # suite. It is enforced in ``rent_schedule_service`` instead — see
        # ``_assert_no_overlap``.
        Index(
            "ix_rent_schedules_applicant_start",
            "applicant_id", "start_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_rent_schedules_org_active",
            "organization_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_rent_schedules_property_id", "property_id"),
    )
