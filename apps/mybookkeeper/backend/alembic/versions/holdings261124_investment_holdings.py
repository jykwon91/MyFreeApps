"""Create securities and holdings; track investments on plaid_items.

``securities``: what a person holds (from Plaid, or typed in), scoped to the
user and organization like their accounts. ``holdings``: how much of one
security one financial account holds — a breakdown of that account's
balance, never counted in net worth on its own.

``plaid_items`` gains ``investments_status`` / ``investments_error_code`` /
``holdings_synced_at`` so a bank that won't give holdings is recorded apart
from the transactions status. All three are nullable and start NULL, so
every existing connection keeps working unchanged.

Purely additive. Downgrade drops both tables (and every holding with them)
and the three columns.

Revision ID: holdings261124
Revises: budget261124
Create Date: 2026-11-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "holdings261124"
down_revision = "budget261124"
branch_labels = None
depends_on = None

# Frozen copies of the enum values at the time of this migration.
_SECURITY_TYPES_SQL = (
    "('equity', 'etf', 'mutual_fund', 'fixed_income', 'cash', "
    "'cryptocurrency', 'derivative', 'loan', 'other')"
)
_INVESTMENTS_STATUSES_SQL = "('active', 'consent_required', 'not_ready', 'unavailable', 'error')"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
    ]


def _tenant() -> list[sa.Column]:
    return [
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "securities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        *_tenant(),
        sa.Column("plaid_security_id", sa.String(100), nullable=True),
        sa.Column("ticker_symbol", sa.String(32), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("security_type", sa.String(20), nullable=False, server_default="other"),
        sa.Column("cusip", sa.String(9), nullable=True),
        sa.Column("isin", sa.String(12), nullable=True),
        sa.Column("is_cash_equivalent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("close_price", sa.Numeric(24, 8), nullable=True),
        sa.Column("close_price_as_of", sa.Date(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        *_timestamps(),
        sa.CheckConstraint(f"security_type IN {_SECURITY_TYPES_SQL}", name="chk_security_type"),
        sa.CheckConstraint(
            "ticker_symbol IS NOT NULL OR name IS NOT NULL", name="chk_security_identified",
        ),
        sa.CheckConstraint(
            "close_price_as_of IS NULL OR close_price IS NOT NULL",
            name="chk_security_close_price_as_of",
        ),
        sa.CheckConstraint("length(currency) = 3", name="chk_security_currency_length"),
    )
    op.create_index("ix_securities_organization_id", "securities", ["organization_id"])
    op.create_index("ix_securities_user_id", "securities", ["user_id"])
    op.create_index(
        "uq_securities_plaid",
        "securities",
        ["organization_id", "user_id", "plaid_security_id"],
        unique=True,
        postgresql_where=sa.text("plaid_security_id IS NOT NULL"),
    )
    op.create_index(
        "uq_securities_manual_ticker",
        "securities",
        ["organization_id", "user_id", "ticker_symbol"],
        unique=True,
        postgresql_where=sa.text("plaid_security_id IS NULL AND ticker_symbol IS NOT NULL"),
    )

    op.create_table(
        "holdings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        *_tenant(),
        sa.Column(
            "financial_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("financial_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "security_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("securities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=True),
        sa.Column("cost_basis_cents", sa.BigInteger(), nullable=True),
        sa.Column("institution_price", sa.Numeric(24, 8), nullable=True),
        sa.Column("institution_price_as_of", sa.Date(), nullable=True),
        sa.Column("institution_value_cents", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        *_timestamps(),
        sa.UniqueConstraint(
            "financial_account_id", "security_id", name="uq_holdings_account_security",
        ),
        sa.CheckConstraint(
            "institution_price_as_of IS NULL OR institution_price IS NOT NULL",
            name="chk_holding_price_as_of",
        ),
        sa.CheckConstraint("length(currency) = 3", name="chk_holding_currency_length"),
    )
    op.create_index("ix_holdings_security_id", "holdings", ["security_id"])
    op.create_index("ix_holdings_org_user", "holdings", ["organization_id", "user_id"])

    op.add_column("plaid_items", sa.Column("investments_status", sa.String(20), nullable=True))
    op.add_column("plaid_items", sa.Column("investments_error_code", sa.String(100), nullable=True))
    op.add_column(
        "plaid_items", sa.Column("holdings_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "chk_plaid_item_investments_status",
        "plaid_items",
        f"investments_status IS NULL OR investments_status IN {_INVESTMENTS_STATUSES_SQL}",
    )


def downgrade() -> None:
    op.drop_constraint("chk_plaid_item_investments_status", "plaid_items", type_="check")
    op.drop_column("plaid_items", "holdings_synced_at")
    op.drop_column("plaid_items", "investments_error_code")
    op.drop_column("plaid_items", "investments_status")

    op.drop_index("ix_holdings_org_user", table_name="holdings")
    op.drop_index("ix_holdings_security_id", table_name="holdings")
    op.drop_table("holdings")

    op.drop_index("uq_securities_manual_ticker", table_name="securities")
    op.drop_index("uq_securities_plaid", table_name="securities")
    op.drop_index("ix_securities_user_id", table_name="securities")
    op.drop_index("ix_securities_organization_id", table_name="securities")
    op.drop_table("securities")
