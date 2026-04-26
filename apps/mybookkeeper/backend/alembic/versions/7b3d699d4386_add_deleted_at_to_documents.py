"""add deleted_at to documents

Revision ID: 7b3d699d4386
Revises: cf24c8782091
Create Date: 2026-03-18 15:36:00.058566

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b3d699d4386'
down_revision: Union[str, None] = 'cf24c8782091'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'deleted_at')
