"""A mortgage secured by a property.

Hangs off the property rather than the listing, for the same reason the
insurance policy does: the lien is against the building. A house let room by
room has one note and many listings.

Two loans against one property is ordinary — a first lien and a HELOC — so
nothing here is unique per property.

Soft-deleted. A satisfied note is still the reason a decade of interest
appears on Schedule E, and the payoff year is exactly when someone goes
looking for it.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.mortgage_enums import RATE_TYPES_SQL
from app.db.base import Base


class Mortgage(Base):
    __tablename__ = "mortgages"

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
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # The statement these figures were read off. SET NULL for the same reason
    # as the insurance policy: the loan terms stay true after the PDF is
    # deleted, they just stop being sourced.
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    lender: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # PII-adjacent, exactly like a policy number: it identifies a person to a
    # financial institution. Encrypted, and never rendered in full.
    account_number: Mapped[str | None] = mapped_column(
        EncryptedString(255), nullable=True,
    )
    key_version: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=1, server_default="1",
    )

    # What is still owed, as of ``statement_date``. Every dollar figure this
    # feature produces is a function of this number, so a balance without the
    # date it was true on is a rate comparison against an unknown loan.
    current_balance_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    statement_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    original_principal_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )

    # A percentage, not a fraction: 7.125 means 7.125%. Three decimals because
    # notes are written to the eighth of a point (7.125, 2.990, 8.250) and
    # rounding to two would silently move a rate by up to half a basis point in
    # a comparison whose whole point is fractions of a point.
    interest_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3), nullable=True,
    )

    # ``fixed`` or ``arm`` — see ``app/core/mortgage_enums.py``. Not nullable
    # and not defaulted at the database level, because "we don't know whether
    # this rate can move" is not a state this feature can reason from: it is
    # the difference between a comparison that means something and one that
    # doesn't. The capture form asks.
    rate_type: Mapped[str] = mapped_column(String(12), nullable=False)

    # The date the current rate stops being guaranteed. Only an ARM has one.
    # Statements state it as a month ("Interest Rate Until February, 2035"), so
    # this is stored as the first of that month.
    fixed_until: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    # Scheduled payoff. Together with the original term this is what says how
    # far into the loan it already is — which decides whether a lower rate on a
    # fresh 30-year clock actually costs less in total.
    maturity_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    # The ORIGINAL amortisation term, not the remaining one. 360 or 180 for
    # everything Freddie Mac surveys.
    term_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The current payment, split the way the statement splits it. Escrow is
    # kept apart deliberately: taxes and insurance do not change when the note
    # is refinanced, so folding them into the payment would understate the
    # saving as a share of what is actually at stake.
    monthly_principal_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    monthly_interest_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    monthly_escrow_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
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
            f"rate_type IN {RATE_TYPES_SQL}",
            name="chk_mortgage_rate_type",
        ),
        # Only an adjustable loan has a date its rate stops being guaranteed.
        # On a fixed loan the column would be read as a reset that isn't
        # coming.
        CheckConstraint(
            "fixed_until IS NULL OR rate_type = 'arm'",
            name="chk_mortgage_fixed_until_arm_only",
        ),
        # A rate of zero is "not recorded", which is what NULL is for. The
        # upper bound is a typo guard: 8.25 entered as 825 would otherwise
        # produce a confidently absurd saving.
        CheckConstraint(
            "interest_rate IS NULL"
            " OR (interest_rate > 0 AND interest_rate < 25)",
            name="chk_mortgage_interest_rate_range",
        ),
        # A balance that has reached zero is a paid-off loan, which is a real
        # and interesting state — so zero is allowed here where a zero rate is
        # not. Negative is not a state.
        CheckConstraint(
            "(current_balance_cents IS NULL OR current_balance_cents >= 0)"
            " AND (original_principal_cents IS NULL"
            "      OR original_principal_cents > 0)"
            " AND (monthly_principal_cents IS NULL"
            "      OR monthly_principal_cents >= 0)"
            " AND (monthly_interest_cents IS NULL"
            "      OR monthly_interest_cents >= 0)"
            " AND (monthly_escrow_cents IS NULL OR monthly_escrow_cents >= 0)",
            name="chk_mortgage_amounts_valid",
        ),
        CheckConstraint(
            "term_months IS NULL OR (term_months > 0 AND term_months <= 600)",
            name="chk_mortgage_term_months_range",
        ),
        # A balance is only meaningful as of a date, and a date with no balance
        # describes nothing. Either both or neither.
        CheckConstraint(
            "(current_balance_cents IS NULL) = (statement_date IS NULL)",
            name="chk_mortgage_balance_as_of_pair",
        ),
        # List page: newest active first per org.
        Index(
            "ix_mortgages_org_created_active",
            "organization_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # The rate check walks every active loan for an org, joined to its
        # property.
        Index(
            "ix_mortgages_org_property_active",
            "organization_id", "property_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
