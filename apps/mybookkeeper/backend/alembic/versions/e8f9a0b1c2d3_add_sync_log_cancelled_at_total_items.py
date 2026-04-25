"""add cancelled_at and total_items to sync_logs

Revision ID: e8f9a0b1c2d3
Revises: ba43787beab3
Create Date: 2026-04-02 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e8f9a0b1c2d3'
down_revision: Union[str, None] = 'ba43787beab3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sync_logs',
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'sync_logs',
        sa.Column('total_items', sa.Integer(), server_default='0', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('sync_logs', 'total_items')
    op.drop_column('sync_logs', 'cancelled_at')
