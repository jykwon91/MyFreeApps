"""add_file_content_to_documents

Revision ID: e1f2a3b4c5d6
Revises: 48b602767714
Create Date: 2026-03-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = '48b602767714'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('file_content', sa.LargeBinary(), nullable=True))
    op.add_column('documents', sa.Column('file_mime_type', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'file_mime_type')
    op.drop_column('documents', 'file_content')
