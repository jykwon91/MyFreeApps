"""add user_sessions and user_activities tables

Revision ID: a3cecc2fda30
Revises: 50ea758245ee
Create Date: 2026-04-02 11:03:57.428096

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a3cecc2fda30'
down_revision: Union[str, None] = '50ea758245ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_sessions',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )
    op.create_index('ix_user_sessions_last_active_at', 'user_sessions', ['last_active_at'], unique=False)

    op.create_table(
        'user_activities',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=True),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('activity_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.execute('CREATE INDEX ix_user_activities_created ON user_activities (created_at DESC)')
    op.execute('CREATE INDEX ix_user_activities_user_created ON user_activities (user_id, created_at DESC)')


def downgrade() -> None:
    op.drop_index('ix_user_activities_user_created', table_name='user_activities')
    op.drop_index('ix_user_activities_created', table_name='user_activities')
    op.drop_table('user_activities')
    op.drop_index('ix_user_sessions_last_active_at', table_name='user_sessions')
    op.drop_table('user_sessions')
