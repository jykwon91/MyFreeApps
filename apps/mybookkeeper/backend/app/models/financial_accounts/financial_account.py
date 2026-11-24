"""A bank, card, loan or investment account the user holds money in or owes on.

Scoped to the user as well as the organization, like a vendor or a mortgage:
a checking account belongs to a person, and a later bank connection is a
person's login, not the workspace's.

Asset or liability is derived from ``account_type`` and never stored, so the
two can never disagree (see ``app/core/financial_account_enums.py``).

``current_balance_cents`` is the number the user (or, later, the bank sync)
last reported, signed the way banks report it: positive is what you HAVE on an
asset and what you OWE on a liability. Negative is a real state on either side
— an overdrawn checking account, a card carrying a credit. Daily history is a
separate table (net-worth snapshots); this row only knows "now".

Soft-deleted so a deletion can be undone, and so transactions that pointed at
the account keep pointing at a row that explains them. Closing is different
from deleting: a closed account is real history the user still wants to see.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    BigInteger,
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

from app.core.financial_account_enums import (
    ACCOUNT_TYPE_MORTGAGE,
    ACCOUNT_TYPES_SQL,
    CURRENCY_LENGTH,
    DEFAULT_CURRENCY,
    INSTITUTION_MAX_LENGTH,
    MASK_MAX_LENGTH,
    NAME_MAX_LENGTH,
)
from app.db.base import Base


class FinancialAccount(Base):
    __tablename__ = "financial_accounts"

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

    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    institution_name: Mapped[str | None] = mapped_column(
        String(INSTITUTION_MAX_LENGTH), nullable=True,
    )
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # The last 2-4 characters of the account number, the way a bank shows it
    # ("…4821"). Not encrypted: it is what every statement, card and bank app
    # prints in the clear, and it cannot identify an account on its own. The
    # width and the CHECK below make a full number unstorable.
    mask: Mapped[str | None] = mapped_column(String(MASK_MAX_LENGTH), nullable=True)

    currency: Mapped[str] = mapped_column(
        String(CURRENCY_LENGTH),
        nullable=False,
        default=DEFAULT_CURRENCY,
        server_default=DEFAULT_CURRENCY,
    )

    current_balance_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    balance_as_of: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    # The day the account was closed; NULL while it is open. A date rather
    # than a flag because "closed in March" is what the transaction history
    # around it needs to make sense.
    closed_on: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    # A mortgage account can point at the loan it is, so the loan's rate and
    # terms (Mortgages page) and its place in net worth (this page) are one
    # thing to the user. SET NULL: deleting the loan record leaves the account.
    mortgage_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mortgages.id", ondelete="SET NULL"),
        nullable=True,
    )

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
            f"account_type IN {ACCOUNT_TYPES_SQL}",
            name="chk_fin_account_type",
        ),
        CheckConstraint(
            "length(trim(name)) > 0", name="chk_fin_account_name_not_blank",
        ),
        # Length only — the pattern (letters and digits) is checked by the
        # schema, because SQLite (the test database) has no regex operator.
        CheckConstraint(
            "mask IS NULL OR length(mask) BETWEEN 2 AND 4",
            name="chk_fin_account_mask_length",
        ),
        CheckConstraint(
            "length(currency) = 3", name="chk_fin_account_currency_length",
        ),
        # A balance is only meaningful as of a date. Either both or neither.
        CheckConstraint(
            "(current_balance_cents IS NULL) = (balance_as_of IS NULL)",
            name="chk_fin_account_balance_as_of_pair",
        ),
        CheckConstraint(
            f"mortgage_id IS NULL OR account_type = '{ACCOUNT_TYPE_MORTGAGE}'",
            name="chk_fin_account_mortgage_link_type",
        ),
        # The Accounts page lists every live account for one person.
        Index(
            "ix_fin_accounts_org_user_active",
            "organization_id", "user_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # One live account per loan: two would count the debt twice.
        Index(
            "uq_fin_accounts_mortgage_active",
            "mortgage_id",
            unique=True,
            postgresql_where=text("mortgage_id IS NOT NULL AND deleted_at IS NULL"),
        ),
    )
