"""add input_tokens, output_tokens, model_name to usage_logs

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "h2i3j4k5l6m7"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usage_logs", sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False))
    op.add_column("usage_logs", sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False))
    op.add_column("usage_logs", sa.Column("model_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("usage_logs", "model_name")
    op.drop_column("usage_logs", "output_tokens")
    op.drop_column("usage_logs", "input_tokens")
