"""add batch_id to documents

Revision ID: 69204c8b3da2
Revises: be97f4240bd7
Create Date: 2026-03-17 00:00:59.394746

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '69204c8b3da2'
down_revision: Union[str, None] = 'be97f4240bd7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('batch_id', sa.String(length=36), nullable=True))
    op.create_index(op.f('ix_documents_batch_id'), 'documents', ['batch_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_documents_batch_id'), table_name='documents')
    op.drop_column('documents', 'batch_id')
