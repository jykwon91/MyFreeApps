"""add transactions.vendor_id FK + partial index (Phase 4 / PR 4.2)

Revision ID: h0j2k5m7n9p1
Revises: g9i1j4l6m8n0
Create Date: 2026-04-29

Phase 4 / PR 4.2 of the rentals expansion. See RENTALS_PLAN.md §5.4.

This migration closes the link between Transactions and the Vendors rolodex
shipped in PR 4.1a:

- Adds a nullable ``vendor_id`` column on ``transactions`` referencing
  ``vendors.id`` with ``ON DELETE SET NULL``. Hosts who hard-delete a vendor
  from their rolodex don't lose the underlying transaction history — the
  link just goes null.
- Adds a partial index ``ix_txn_vendor_id_partial`` on the column where
  ``vendor_id IS NOT NULL``. The vast majority of transactions will not
  have a vendor link (income, mortgage, etc.), so a regular index would
  waste space on NULL rows. Partial index only covers the rows queries
  actually scan.

The free-text ``transactions.vendor`` column (TEXT) is preserved unchanged —
it stays as the historical AI-extracted name. ``vendor_id`` is the
host-curated link to a Vendor row, populated manually via the Transaction
edit page.

Conventions followed (mirrors ``76b63dd74f54_add_activity_tax_profile_tax_year_.py``
which added ``transactions.activity_id`` with the same ``ON DELETE SET NULL``
pattern):

- FK constraint name: ``fk_txn_vendor`` (matches ``fk_txn_activity`` style).
- Index name: ``ix_txn_vendor_id_partial`` (per RENTALS_PLAN.md §4.1
  partial-index naming).
- Down-migration drops the index, then the FK constraint, then the column —
  reverse of upgrade order.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "h0j2k5m7n9p1"
down_revision: Union[str, None] = "g9i1j4l6m8n0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "vendor_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_txn_vendor",
        "transactions",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_txn_vendor_id_partial",
        "transactions",
        ["vendor_id"],
        postgresql_where=sa.text("vendor_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_txn_vendor_id_partial", table_name="transactions")
    op.drop_constraint("fk_txn_vendor", "transactions", type_="foreignkey")
    op.drop_column("transactions", "vendor_id")
