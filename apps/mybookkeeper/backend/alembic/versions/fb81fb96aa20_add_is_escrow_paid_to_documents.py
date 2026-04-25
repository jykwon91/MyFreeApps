"""add is_escrow_paid to documents

Revision ID: fb81fb96aa20
Revises: d5e6f7g8h9i0
Create Date: 2026-03-30 09:28:32.416870

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fb81fb96aa20'
down_revision: Union[str, None] = 'd5e6f7g8h9i0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('is_escrow_paid', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('documents', 'is_escrow_paid')
