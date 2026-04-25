"""add sub_category to transactions and classification_rules

Revision ID: 8368c5100728
Revises: a0861445a1cd
Create Date: 2026-03-31 17:10:23.891395

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '8368c5100728'
down_revision: Union[str, None] = 'a0861445a1cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add sub_category to transactions
    op.add_column('transactions', sa.Column('sub_category', sa.String(length=50), nullable=True))
    op.create_check_constraint(
        'chk_txn_sub_category',
        'transactions',
        "sub_category IS NULL OR sub_category IN ('electricity', 'water', 'gas', 'internet', 'trash', 'sewer')",
    )
    op.create_index(
        'ix_txn_utility_trends',
        'transactions',
        ['organization_id', 'sub_category', 'property_id', 'transaction_date'],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL AND category = 'utilities' AND sub_category IS NOT NULL"),
    )

    # Backfill sub_category for existing utility transactions.
    # Order matters: gas before electricity (prevents "Atmos Energy" matching %energy%),
    # trash/sewer first (prevents "Frontier Waste" matching %frontier% for internet).
    op.execute(sa.text("""
        UPDATE transactions
        SET sub_category = CASE
            WHEN (
                normalized_vendor ILIKE '%trash%'
                OR normalized_vendor ILIKE '%waste%'
                OR normalized_vendor ILIKE '%garbage%'
                OR normalized_vendor ILIKE '%recycling%'
                OR vendor ILIKE '%trash%'
                OR vendor ILIKE '%waste%'
                OR vendor ILIKE '%garbage%'
                OR vendor ILIKE '%recycling%'
            ) THEN 'trash'
            WHEN (
                normalized_vendor ILIKE '%sewer%'
                OR vendor ILIKE '%sewer%'
            ) THEN 'sewer'
            WHEN (
                normalized_vendor ILIKE '%atmos%'
                OR normalized_vendor ILIKE '% gas%'
                OR normalized_vendor ILIKE 'gas %'
                OR normalized_vendor = 'gas'
                OR vendor ILIKE '%atmos%'
                OR vendor ILIKE '% gas%'
                OR vendor ILIKE 'gas %'
                OR vendor = 'gas'
                OR description ILIKE '%natural gas%'
                OR description ILIKE '%gas charges%'
                OR description ILIKE '%gas bill%'
            ) THEN 'gas'
            WHEN (
                normalized_vendor ILIKE '%electric%'
                OR normalized_vendor ILIKE '%energy%'
                OR normalized_vendor ILIKE '%power%'
                OR normalized_vendor ILIKE '%centerpoint%'
                OR normalized_vendor ILIKE '%txu%'
                OR normalized_vendor ILIKE '%reliant%'
                OR normalized_vendor ILIKE '%nrg%'
                OR normalized_vendor ILIKE '%constellation%'
                OR vendor ILIKE '%electric%'
                OR vendor ILIKE '%energy%'
                OR vendor ILIKE '%power%'
                OR vendor ILIKE '%centerpoint%'
                OR vendor ILIKE '%txu%'
                OR vendor ILIKE '%reliant%'
                OR vendor ILIKE '%nrg%'
                OR vendor ILIKE '%constellation%'
            ) THEN 'electricity'
            WHEN (
                normalized_vendor ILIKE '%water%'
                OR normalized_vendor ILIKE '%aqua%'
                OR vendor ILIKE '%water%'
                OR vendor ILIKE '%aqua%'
                OR description ILIKE '%water%sewer%'
                OR description ILIKE '%water bill%'
                OR description ILIKE '%water utility%'
            ) THEN 'water'
            WHEN (
                normalized_vendor ILIKE '%internet%'
                OR normalized_vendor ILIKE '%at&t%'
                OR normalized_vendor ILIKE '%at_t%'
                OR normalized_vendor ILIKE '%comcast%'
                OR normalized_vendor ILIKE '%xfinity%'
                OR normalized_vendor ILIKE '%spectrum%'
                OR normalized_vendor ILIKE '%frontier%'
                OR normalized_vendor ILIKE '%verizon fios%'
                OR vendor ILIKE '%internet%'
                OR vendor ILIKE '%at&t%'
                OR vendor ILIKE '%comcast%'
                OR vendor ILIKE '%xfinity%'
                OR vendor ILIKE '%spectrum%'
                OR vendor ILIKE '%frontier%'
                OR vendor ILIKE '%verizon fios%'
            ) THEN 'internet'
            ELSE NULL
        END
        WHERE category = 'utilities'
          AND sub_category IS NULL
          AND deleted_at IS NULL
    """))

    # Add sub_category to classification_rules
    op.add_column('classification_rules', sa.Column('sub_category', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('classification_rules', 'sub_category')
    op.drop_index('ix_txn_utility_trends', table_name='transactions')
    op.drop_constraint('chk_txn_sub_category', 'transactions', type_='check')
    op.drop_column('transactions', 'sub_category')
