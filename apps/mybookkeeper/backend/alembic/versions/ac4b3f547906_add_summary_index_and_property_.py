"""add_summary_index_and_property_timestamps

Revision ID: ac4b3f547906
Revises: 7b3d699d4386
Create Date: 2026-03-18 22:35:07.619360

"""
from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac4b3f547906'
down_revision: Union[str, None] = '7b3d699d4386'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_documents_summary', 'documents', ['user_id', 'date'],
        unique=False,
        postgresql_where=sa.text("status = 'approved' AND amount IS NOT NULL"),
    )
    op.add_column('properties', sa.Column(
        'created_at', sa.DateTime(timezone=True),
        nullable=True,
    ))
    op.add_column('properties', sa.Column(
        'updated_at', sa.DateTime(timezone=True),
        nullable=True,
    ))
    now = datetime.now(timezone.utc).isoformat()
    op.execute(f"UPDATE properties SET created_at = '{now}', updated_at = '{now}' WHERE created_at IS NULL")
    op.alter_column('properties', 'created_at', nullable=False)
    op.alter_column('properties', 'updated_at', nullable=False)


def downgrade() -> None:
    op.drop_column('properties', 'updated_at')
    op.drop_column('properties', 'created_at')
    op.drop_index('ix_documents_summary', table_name='documents',
                  postgresql_where=sa.text("status = 'approved' AND amount IS NOT NULL"))
