"""document_level_email_queue

Revision ID: f3a4b5c6d7e8
Revises: e1f2a3b4c5d6
Create Date: 2026-03-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f3a4b5c6d7e8'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns
    op.add_column('email_queue', sa.Column('attachment_id', sa.String(255), nullable=False, server_default='legacy'))
    op.add_column('email_queue', sa.Column('attachment_filename', sa.String(500), nullable=True))
    op.add_column('email_queue', sa.Column('attachment_content_type', sa.String(100), nullable=True))
    op.add_column('email_queue', sa.Column('email_subject', sa.String(500), nullable=True))

    # Replace the per-email unique constraint with a per-document one
    op.drop_constraint('uq_email_queue_user_message', 'email_queue', type_='unique')
    op.create_unique_constraint(
        'uq_email_queue_user_message_attachment',
        'email_queue',
        ['user_id', 'message_id', 'attachment_id'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_email_queue_user_message_attachment', 'email_queue', type_='unique')
    op.create_unique_constraint('uq_email_queue_user_message', 'email_queue', ['user_id', 'message_id'])
    op.drop_column('email_queue', 'email_subject')
    op.drop_column('email_queue', 'attachment_content_type')
    op.drop_column('email_queue', 'attachment_filename')
    op.drop_column('email_queue', 'attachment_id')
