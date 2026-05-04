"""Add needs_reauth, last_reauth_error, last_reauth_failed_at to integrations

Revision ID: gmreauth260504
Revises: calttp260503
Create Date: 2026-05-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'gmreauth260504'
down_revision: Union[str, None] = 'calttp260503'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'integrations',
        sa.Column(
            'needs_reauth',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )
    op.add_column(
        'integrations',
        sa.Column('last_reauth_error', sa.Text(), nullable=True),
    )
    op.add_column(
        'integrations',
        sa.Column(
            'last_reauth_failed_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('integrations', 'last_reauth_failed_at')
    op.drop_column('integrations', 'last_reauth_error')
    op.drop_column('integrations', 'needs_reauth')
