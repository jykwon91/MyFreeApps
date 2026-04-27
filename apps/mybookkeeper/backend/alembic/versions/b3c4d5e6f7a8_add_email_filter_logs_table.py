"""add email_filter_logs table

Audit log of emails skipped by the bounce detector before Claude
extraction (mailer-daemon failures, auto-replies, RFC 3464 DSNs).

Revision ID: b3c4d5e6f7a8
Revises: b7e9d3a14f02
Create Date: 2026-04-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'b7e9d3a14f02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'email_filter_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('message_id', sa.String(length=255), nullable=False),
        sa.Column('from_address', sa.String(length=500), nullable=True),
        sa.Column('subject', sa.String(length=500), nullable=True),
        sa.Column('reason', sa.String(length=50), nullable=False),
        sa.Column('filtered_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'message_id', name='uq_email_filter_log_user_message'),
    )
    # Index supports the most common query: list recent filtered emails for an org.
    op.execute(
        'CREATE INDEX ix_email_filter_logs_org_filtered_at '
        'ON email_filter_logs (organization_id, filtered_at DESC)'
    )


def downgrade() -> None:
    op.drop_index('ix_email_filter_logs_org_filtered_at', table_name='email_filter_logs')
    op.drop_table('email_filter_logs')
