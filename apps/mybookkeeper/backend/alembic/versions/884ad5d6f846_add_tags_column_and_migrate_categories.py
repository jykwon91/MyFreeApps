"""add_tags_column_and_migrate_categories

Revision ID: 884ad5d6f846
Revises: 3244bc3ff976
Create Date: 2026-03-18 00:00:10.017592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '884ad5d6f846'
down_revision: Union[str, None] = '3244bc3ff976'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add tags column
    op.add_column('documents', sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # Migrate: copy category + linen_flag into tags array
    op.execute(sa.text("""
        UPDATE documents
        SET tags = CASE
            WHEN linen_flag = true AND category::text != 'UNCATEGORIZED'
                THEN jsonb_build_array(lower(category::text), 'linen')
            WHEN linen_flag = true
                THEN jsonb_build_array('linen')
            WHEN category::text != 'UNCATEGORIZED'
                THEN jsonb_build_array(lower(category::text))
            ELSE '[]'::jsonb
        END
    """))

    # Drop old columns
    op.drop_column('documents', 'linen_flag')
    op.drop_column('documents', 'category')

    # Drop the category enum type from postgres
    op.execute(sa.text("DROP TYPE IF EXISTS category"))

    # Create GIN index for tag queries
    op.create_index('ix_documents_tags', 'documents', ['tags'], postgresql_using='gin')


def downgrade() -> None:
    # Recreate category enum and columns
    op.execute(sa.text("""
        CREATE TYPE category AS ENUM (
            'RENTAL_REVENUE', 'CLEANING_FEE_REVENUE', 'CHANNEL_FEE', 'CLEANING_EXPENSE',
            'MAINTENANCE', 'MANAGEMENT_FEE', 'NET_INCOME', 'MORTGAGE', 'INSURANCE',
            'UTILITIES', 'TAXES', 'OTHER_EXPENSE', 'UNCATEGORIZED'
        )
    """))
    op.add_column('documents', sa.Column('category', sa.Enum(
        'RENTAL_REVENUE', 'CLEANING_FEE_REVENUE', 'CHANNEL_FEE', 'CLEANING_EXPENSE',
        'MAINTENANCE', 'MANAGEMENT_FEE', 'NET_INCOME', 'MORTGAGE', 'INSURANCE',
        'UTILITIES', 'TAXES', 'OTHER_EXPENSE', 'UNCATEGORIZED',
        name='category'), nullable=True, server_default='UNCATEGORIZED'))
    op.add_column('documents', sa.Column('linen_flag', sa.Boolean(), nullable=True, server_default='false'))
    op.drop_index('ix_documents_tags', table_name='documents')
    op.drop_column('documents', 'tags')
