"""Create spending_budgets: a monthly budget per personal spending category.

One row per (category, effective month); a row holds from its month until the
category's next row, so changing a budget never rewrites an earlier month's
target. ``amount_cents`` NULL is "no budget from this month on".

Purely additive and starts empty. Downgrade drops the table and the budgets
people set with it.

The budget and cash flow reads use the existing ``ix_txn_summary`` index
(organization, date, type, category over live approved rows); no transaction
index is added.

Revision ID: budget261124
Revises: networth261124
Create Date: 2026-11-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "budget261124"
down_revision = "networth261124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "spending_budgets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "spending_category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spending_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("effective_month", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "spending_category_id", "effective_month", name="uq_spending_budget_category_month",
        ),
        sa.CheckConstraint(
            "amount_cents IS NULL OR amount_cents >= 0",
            name="chk_spending_budget_amount_non_negative",
        ),
        sa.CheckConstraint(
            "effective_month = CAST(date_trunc('month', effective_month) AS DATE)",
            name="chk_spending_budget_month_start",
        ),
    )
    op.create_index(
        "ix_spending_budgets_organization_id", "spending_budgets", ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_spending_budgets_organization_id", table_name="spending_budgets")
    op.drop_table("spending_budgets")
