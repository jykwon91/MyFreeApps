"""add_raw_content_to_email_queue

Revision ID: g4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-03-15 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'g4b5c6d7e8f9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('email_queue', sa.Column('raw_content', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('email_queue', 'raw_content')
