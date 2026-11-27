"""Transaction property splits: one payment's shares across several properties.

- ``transaction_property_splits``: one row per property a transaction is split
  across, with that property's share of the amount. A split transaction has no
  ``property_id`` of its own; per-property figures read the shares instead.
  Deleting a property keeps its share with no property (SET NULL), so totals
  never lose the money.

Additive. Downgrade drops the shares, leaving split transactions with no
property, which is what they had on the transaction row while split.

Revision ID: txnsplit261127
Revises: loanpayee261127
Create Date: 2026-11-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "txnsplit261127"
down_revision = "loanpayee261127"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_property_splits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("transaction_id", "property_id", name="uq_txn_split_property"),
        sa.CheckConstraint("amount > 0", name="chk_txn_split_amount_positive"),
    )
    op.create_index("ix_txn_split_property", "transaction_property_splits", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_txn_split_property", table_name="transaction_property_splits")
    op.drop_table("transaction_property_splits")
