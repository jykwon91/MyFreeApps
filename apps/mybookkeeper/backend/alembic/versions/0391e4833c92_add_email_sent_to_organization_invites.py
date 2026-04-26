"""add email_sent to organization_invites

Revision ID: 0391e4833c92
Revises: b124e8813fae
Create Date: 2026-04-02 20:27:17.795700

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0391e4833c92'
down_revision: Union[str, None] = 'b124e8813fae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organization_invites',
        sa.Column('email_sent', sa.Boolean(), server_default='false', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('organization_invites', 'email_sent')
