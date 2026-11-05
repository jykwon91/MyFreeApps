"""Drop ix_txn_utility_trends, unused now that untyped utility bills are counted.

The index only covered rows with a sub_category. Utility trends now reads rows
without one as well, and ix_txn_org_category_date serves that query.

Revision ID: k7m2p9q4t1v8
Revises: sensrev261104
"""
import sqlalchemy as sa
from alembic import op

revision = "k7m2p9q4t1v8"
down_revision = "sensrev261104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_txn_utility_trends", table_name="transactions")


def downgrade() -> None:
    op.create_index(
        "ix_txn_utility_trends",
        "transactions",
        ["organization_id", "sub_category", "property_id", "transaction_date"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL AND category = 'utilities' AND sub_category IS NOT NULL"),
    )
