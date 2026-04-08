"""add duplicate_reviewed_at to transactions

Revision ID: 170e84f3bc64
Revises: 08cfc089005c
Create Date: 2026-03-29 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '170e84f3bc64'
down_revision: Union[str, None] = '08cfc089005c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'transactions',
        sa.Column('duplicate_reviewed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('transactions', 'duplicate_reviewed_at')
