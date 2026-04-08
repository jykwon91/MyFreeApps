"""drop_smtp_columns_from_platform_settings

Revision ID: 45cb8eebb757
Revises: i3j4k5l6m7n8
Create Date: 2026-03-22 09:26:35.095762

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '45cb8eebb757'
down_revision: Union[str, None] = 'i3j4k5l6m7n8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'platform_settings' AND column_name IN "
        "('notification_email', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password')"
    ))
    existing = {row[0] for row in result}
    for col in ('notification_email', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'):
        if col in existing:
            op.drop_column('platform_settings', col)


def downgrade() -> None:
    op.add_column('platform_settings', sa.Column('smtp_password', sa.VARCHAR(255), nullable=True))
    op.add_column('platform_settings', sa.Column('smtp_user', sa.VARCHAR(255), nullable=True))
    op.add_column('platform_settings', sa.Column('smtp_port', sa.INTEGER(), server_default=sa.text('587'), nullable=False))
    op.add_column('platform_settings', sa.Column('smtp_host', sa.VARCHAR(255), nullable=True))
    op.add_column('platform_settings', sa.Column('notification_email', sa.VARCHAR(255), nullable=True))
