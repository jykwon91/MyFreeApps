"""How much of one security one investment account holds.

A holding is a breakdown of its account's balance, never an asset of its own:
net worth counts ``financial_accounts.current_balance_cents`` and nothing
here. For an account synced from a bank both numbers come from Plaid. For an
account kept by hand that has holdings, the account's balance IS the sum of
``institution_value_cents`` (cash included, as a cash holding) — the holdings
service writes it on every change and the account service refuses a typed
balance — so the two can never disagree.

``institution_*`` is the price and value as the account holder reports them:
Plaid's for a synced account, the person's own for one kept by hand. A price
is per unit and can carry fractions of a cent, so it is ``Numeric``; value and
cost basis are amounts of money and stay in cents like every other amount.

Owned by the account (CASCADE): an account that is soft-deleted keeps its
holdings hidden with it, and restoring it brings them back. CASCADE from the
security too: a holding can't exist without what it holds, and only the app
deletes a security, once nothing holds it.
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
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.financial_account_enums import CURRENCY_LENGTH, DEFAULT_CURRENCY
from app.core.investment_enums import (
    PRICE_PRECISION,
    PRICE_SCALE,
    QUANTITY_PRECISION,
    QUANTITY_SCALE,
)
from app.db.base import Base


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    financial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    security_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("securities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Plaid documents every one of these as nullable; a hand-entered holding
    # always has quantity, price and value (the schema requires them).
    quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(QUANTITY_PRECISION, QUANTITY_SCALE), nullable=True,
    )
    cost_basis_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    institution_price: Mapped[Decimal | None] = mapped_column(
        Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=True,
    )
    institution_price_as_of: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    institution_value_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(
        String(CURRENCY_LENGTH),
        nullable=False,
        default=DEFAULT_CURRENCY,
        server_default=DEFAULT_CURRENCY,
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
        # One line per security per account; a second lot of the same fund is
        # the same holding with a bigger quantity.
        UniqueConstraint(
            "financial_account_id", "security_id", name="uq_holdings_account_security",
        ),
        CheckConstraint(
            "institution_price_as_of IS NULL OR institution_price IS NOT NULL",
            name="chk_holding_price_as_of",
        ),
        CheckConstraint(
            "length(currency) = 3", name="chk_holding_currency_length",
        ),
        # The Investments page lists one person's holdings.
        Index("ix_holdings_org_user", "organization_id", "user_id"),
    )
