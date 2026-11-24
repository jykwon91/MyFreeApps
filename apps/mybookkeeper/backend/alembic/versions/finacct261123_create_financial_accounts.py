"""Create financial_accounts; link transactions to them; add transfers.

Three things, in one revision because each needs the others:

* ``financial_accounts`` — checking, savings, cards, loans, brokerage. Scoped
  to the user and the organization, soft-deleted, asset/liability derived from
  ``account_type`` (never stored).
* ``transactions.account_id`` / ``transfer_to_account_id`` — nullable FKs,
  SET NULL, partial-indexed. Every existing row stays account-less.
* ``transfer`` as both a ``transaction_type`` and a ``category``. A transfer
  between your own accounts is neither income nor expense and is barred from
  every tax figure by ``chk_txn_transfer_not_tax``.

Purely additive for existing rows: no existing value is rewritten, and every
widened CHECK still accepts every row the old one did.

Downgrade refuses to run while any transfer row exists rather than rewriting
the user's transfers into a type they are not. Re-categorise them first.

Revision ID: finacct261123
Revises: auditactorix261123
Create Date: 2026-11-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.financial_account_enums import ACCOUNT_TYPES_SQL

revision = "finacct261123"
down_revision = "auditactorix261123"
branch_labels = None
depends_on = None

_OLD_CATEGORIES = (
    "'rental_revenue', 'cleaning_fee_revenue', 'business_income', "
    "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
    "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
    "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
    "'furnishings', 'other_expense', 'uncategorized', 'security_deposit', "
    "'supplies', 'home_office', 'meals', 'vehicle_expenses', "
    "'health_insurance', 'education_training'"
)
_INCOME_CATEGORIES = (
    "'rental_revenue', 'cleaning_fee_revenue', 'business_income', "
    "'uncategorized', 'security_deposit'"
)
_NOT_EXPENSE = (
    "'rental_revenue', 'cleaning_fee_revenue', 'business_income', 'security_deposit'"
)


def upgrade() -> None:
    op.create_table(
        "financial_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
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
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("institution_name", sa.String(255), nullable=True),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("mask", sa.String(4), nullable=True),
        sa.Column(
            "currency", sa.String(3), nullable=False, server_default="USD",
        ),
        sa.Column("current_balance_cents", sa.BigInteger(), nullable=True),
        sa.Column("balance_as_of", sa.Date(), nullable=True),
        sa.Column("closed_on", sa.Date(), nullable=True),
        sa.Column(
            "mortgage_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mortgages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            f"account_type IN {ACCOUNT_TYPES_SQL}", name="chk_fin_account_type",
        ),
        sa.CheckConstraint(
            "length(trim(name)) > 0", name="chk_fin_account_name_not_blank",
        ),
        sa.CheckConstraint(
            "mask IS NULL OR length(mask) BETWEEN 2 AND 4",
            name="chk_fin_account_mask_length",
        ),
        sa.CheckConstraint(
            "length(currency) = 3", name="chk_fin_account_currency_length",
        ),
        sa.CheckConstraint(
            "(current_balance_cents IS NULL) = (balance_as_of IS NULL)",
            name="chk_fin_account_balance_as_of_pair",
        ),
        sa.CheckConstraint(
            "mortgage_id IS NULL OR account_type = 'mortgage'",
            name="chk_fin_account_mortgage_link_type",
        ),
    )
    op.create_index(
        "ix_financial_accounts_organization_id",
        "financial_accounts",
        ["organization_id"],
    )
    op.create_index(
        "ix_financial_accounts_user_id", "financial_accounts", ["user_id"],
    )
    op.create_index(
        "ix_fin_accounts_org_user_active",
        "financial_accounts",
        ["organization_id", "user_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_fin_accounts_mortgage_active",
        "financial_accounts",
        ["mortgage_id"],
        unique=True,
        postgresql_where=sa.text("mortgage_id IS NOT NULL AND deleted_at IS NULL"),
    )

    op.add_column(
        "transactions",
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "transfer_to_account_id", postgresql.UUID(as_uuid=True), nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_txn_account", "transactions", "financial_accounts",
        ["account_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_txn_transfer_to_account", "transactions", "financial_accounts",
        ["transfer_to_account_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "ix_txn_account_id_partial", "transactions", ["account_id"],
        postgresql_where=sa.text("account_id IS NOT NULL"),
    )
    op.create_index(
        "ix_txn_transfer_to_account_id_partial", "transactions",
        ["transfer_to_account_id"],
        postgresql_where=sa.text("transfer_to_account_id IS NOT NULL"),
    )

    op.drop_constraint("chk_txn_type", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_type", "transactions",
        "transaction_type IN ('income', 'expense', 'transfer')",
    )
    op.drop_constraint("chk_txn_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_category", "transactions",
        f"category IN ({_OLD_CATEGORIES}, 'transfer')",
    )
    op.drop_constraint("chk_txn_type_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_type_category", "transactions",
        f"(transaction_type = 'income' AND category IN ({_INCOME_CATEGORIES})) OR "
        f"(transaction_type = 'expense' AND category NOT IN ({_NOT_EXPENSE}, 'transfer')) OR "
        "(transaction_type = 'transfer' AND category = 'transfer')",
    )
    op.create_check_constraint(
        "chk_txn_transfer_to_only_transfer", "transactions",
        "transfer_to_account_id IS NULL OR transaction_type = 'transfer'",
    )
    op.create_check_constraint(
        "chk_txn_transfer_distinct_accounts", "transactions",
        "account_id IS NULL OR transfer_to_account_id IS NULL"
        " OR account_id <> transfer_to_account_id",
    )
    op.create_check_constraint(
        "chk_txn_transfer_not_tax", "transactions",
        "transaction_type <> 'transfer' OR ("
        "NOT tax_relevant AND schedule_e_line IS NULL AND NOT is_capital_improvement"
        ")",
    )


def downgrade() -> None:
    transfers = op.get_bind().execute(
        sa.text("SELECT count(*) FROM transactions WHERE transaction_type = 'transfer'"),
    ).scalar_one()
    if transfers:
        raise RuntimeError(
            f"{transfers} transfer transaction(s) exist; re-categorise them before "
            "downgrading. The previous schema has no way to store a transfer.",
        )

    op.drop_constraint("chk_txn_transfer_not_tax", "transactions", type_="check")
    op.drop_constraint("chk_txn_transfer_distinct_accounts", "transactions", type_="check")
    op.drop_constraint("chk_txn_transfer_to_only_transfer", "transactions", type_="check")
    op.drop_constraint("chk_txn_type_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_type_category", "transactions",
        f"(transaction_type = 'income' AND category IN ({_INCOME_CATEGORIES})) OR "
        f"(transaction_type = 'expense' AND category NOT IN ({_NOT_EXPENSE}))",
    )
    op.drop_constraint("chk_txn_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_category", "transactions", f"category IN ({_OLD_CATEGORIES})",
    )
    op.drop_constraint("chk_txn_type", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_type", "transactions",
        "transaction_type IN ('income', 'expense')",
    )

    op.drop_index("ix_txn_transfer_to_account_id_partial", table_name="transactions")
    op.drop_index("ix_txn_account_id_partial", table_name="transactions")
    op.drop_constraint("fk_txn_transfer_to_account", "transactions", type_="foreignkey")
    op.drop_constraint("fk_txn_account", "transactions", type_="foreignkey")
    op.drop_column("transactions", "transfer_to_account_id")
    op.drop_column("transactions", "account_id")

    op.drop_index("uq_fin_accounts_mortgage_active", table_name="financial_accounts")
    op.drop_index("ix_fin_accounts_org_user_active", table_name="financial_accounts")
    op.drop_index("ix_financial_accounts_user_id", table_name="financial_accounts")
    op.drop_index("ix_financial_accounts_organization_id", table_name="financial_accounts")
    op.drop_table("financial_accounts")
