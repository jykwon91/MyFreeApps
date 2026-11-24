"""One day's value of one thing that counts toward a person's net worth.

A snapshot is about exactly one source: a financial account, a mortgage record
with no account linked to it, or a property with a value entered. Which one is
derived from which foreign key is set, never stored a second time.

Written for today whenever a balance changes (an edit, a bank sync, a new
property value) and once a day by the scheduler for everything that counts,
so history has no gaps from the first snapshot on. Nothing is backfilled:
history starts at the first snapshot.

Scoped to the person, like their accounts and loans. A property is the
workspace's, so each person whose net worth includes it gets their own row.

Asset or liability is not stored either: an account's comes from its type, a
property is always an asset, a mortgage always a liability.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_ONE_SOURCE = (
    "(CASE WHEN financial_account_id IS NULL THEN 0 ELSE 1 END"
    " + CASE WHEN mortgage_id IS NULL THEN 0 ELSE 1 END"
    " + CASE WHEN property_id IS NULL THEN 0 ELSE 1 END) = 1"
)


class BalanceSnapshot(Base):
    __tablename__ = "balance_snapshots"

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
        nullable=False,
    )
    snapshot_date: Mapped[_dt.date] = mapped_column(Date, nullable=False)

    # CASCADE on all three: a snapshot describes its source and means nothing
    # without it. (A deleted account or loan is soft-deleted, so its history
    # stays until the row itself goes.)
    financial_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_accounts.id", ondelete="CASCADE"),
        nullable=True,
    )
    mortgage_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mortgages.id", ondelete="CASCADE"),
        nullable=True,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Signed the way the source reports it: positive is what you have on an
    # asset and what you owe on a liability.
    balance_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)

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
        CheckConstraint(_ONE_SOURCE, name="chk_balance_snapshot_one_source"),
        # One value per source per day. Each index leads with its foreign key,
        # so it also serves that key's cascade.
        Index(
            "uq_balance_snapshots_account_day",
            "financial_account_id", "snapshot_date",
            unique=True,
            postgresql_where=text("financial_account_id IS NOT NULL"),
            sqlite_where=text("financial_account_id IS NOT NULL"),
        ),
        Index(
            "uq_balance_snapshots_mortgage_day",
            "mortgage_id", "snapshot_date",
            unique=True,
            postgresql_where=text("mortgage_id IS NOT NULL"),
            sqlite_where=text("mortgage_id IS NOT NULL"),
        ),
        Index(
            "uq_balance_snapshots_property_user_day",
            "property_id", "user_id", "snapshot_date",
            unique=True,
            postgresql_where=text("property_id IS NOT NULL"),
            sqlite_where=text("property_id IS NOT NULL"),
        ),
        # The history chart reads one person's snapshots over a date range.
        Index(
            "ix_balance_snapshots_user_org_date",
            "user_id", "organization_id", "snapshot_date",
        ),
    )
