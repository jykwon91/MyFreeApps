"""add error_message to documents

Revision ID: q1r2s3t4u5v6
Revises: p1a2d3i4n5t6
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'q1r2s3t4u5v6'
down_revision: Union[str, None] = 'p1a2d3i4n5t6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('error_message', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'error_message')
