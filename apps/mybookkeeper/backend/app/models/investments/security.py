"""A stock, fund, bond or other thing a person holds in an investment account.

Scoped to the user as well as the organization, like the accounts that hold
it. Plaid's ``security_id`` is the same for everyone holding the same security
at the same bank, so a workspace-wide row would be possible for Plaid data —
but a hand-entered security is what one person typed (its name, ticker and
type), and a shared row would let one member's holdings shape what another
member sees (and what their data export contains). One person's securities
are theirs; two members holding the same fund each have a row.

A security from Plaid carries ``plaid_security_id``; one typed in has none and
is found again by its ticker (or, without one, its name). ``close_price`` is
Plaid's last market close; a hand-entered holding keeps its own price on the
holding, since that is the number the person read off their statement.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.financial_account_enums import CURRENCY_LENGTH, DEFAULT_CURRENCY
from app.core.investment_enums import (
    CUSIP_LENGTH,
    ISIN_LENGTH,
    PRICE_PRECISION,
    PRICE_SCALE,
    SECURITY_NAME_MAX_LENGTH,
    SECURITY_TYPE_MAX_LENGTH,
    SECURITY_TYPE_OTHER,
    SECURITY_TYPES_SQL,
    TICKER_MAX_LENGTH,
)
from app.core.plaid_constants import PLAID_ID_MAX_LENGTH
from app.db.base import Base

_MANUAL_TICKER_WHERE = "plaid_security_id IS NULL AND ticker_symbol IS NOT NULL"


class Security(Base):
    __tablename__ = "securities"

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
        index=True,
        nullable=False,
    )

    # Plaid's id; NULL for a security typed in by hand.
    plaid_security_id: Mapped[str | None] = mapped_column(
        String(PLAID_ID_MAX_LENGTH), nullable=True,
    )
    ticker_symbol: Mapped[str | None] = mapped_column(String(TICKER_MAX_LENGTH), nullable=True)
    name: Mapped[str | None] = mapped_column(String(SECURITY_NAME_MAX_LENGTH), nullable=True)
    security_type: Mapped[str] = mapped_column(
        String(SECURITY_TYPE_MAX_LENGTH),
        nullable=False,
        default=SECURITY_TYPE_OTHER,
        server_default=SECURITY_TYPE_OTHER,
    )
    # Only when Plaid sends them (it needs a CUSIP Global Services licence to).
    cusip: Mapped[str | None] = mapped_column(String(CUSIP_LENGTH), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(ISIN_LENGTH), nullable=True)
    is_cash_equivalent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"),
    )

    close_price: Mapped[Decimal | None] = mapped_column(
        Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=True,
    )
    close_price_as_of: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
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
        CheckConstraint(
            f"security_type IN {SECURITY_TYPES_SQL}", name="chk_security_type",
        ),
        # Something has to say what it is.
        CheckConstraint(
            "ticker_symbol IS NOT NULL OR name IS NOT NULL",
            name="chk_security_identified",
        ),
        # Plaid: close_price_as_of is always null when close_price is.
        CheckConstraint(
            "close_price_as_of IS NULL OR close_price IS NOT NULL",
            name="chk_security_close_price_as_of",
        ),
        CheckConstraint(
            "length(currency) = 3", name="chk_security_currency_length",
        ),
        # One row per Plaid security per person: every connection of theirs
        # that holds it points at the same row.
        Index(
            "uq_securities_plaid",
            "organization_id", "user_id", "plaid_security_id",
            unique=True,
            postgresql_where=text("plaid_security_id IS NOT NULL"),
            sqlite_where=text("plaid_security_id IS NOT NULL"),
        ),
        # One hand-entered row per ticker per person, so the same fund in two
        # accounts is one security.
        Index(
            "uq_securities_manual_ticker",
            "organization_id", "user_id", "ticker_symbol",
            unique=True,
            postgresql_where=text(_MANUAL_TICKER_WHERE),
            sqlite_where=text(_MANUAL_TICKER_WHERE),
        ),
    )
