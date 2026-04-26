"""add content_hash to documents

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f7
Create Date: 2026-03-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('content_hash', sa.String(64), nullable=True))
    op.create_index('ix_documents_content_hash', 'documents', ['organization_id', 'content_hash'])


def downgrade() -> None:
    op.drop_index('ix_documents_content_hash', table_name='documents')
    op.drop_column('documents', 'content_hash')
