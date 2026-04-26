"""add platform_settings table

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True, default=1),
        sa.Column("cost_input_rate_per_million", sa.Numeric(10, 4), server_default="3.0", nullable=False),
        sa.Column("cost_output_rate_per_million", sa.Numeric(10, 4), server_default="15.0", nullable=False),
        sa.Column("cost_daily_budget", sa.Numeric(10, 2), server_default="50.0", nullable=False),
        sa.Column("cost_monthly_budget", sa.Numeric(10, 2), server_default="1000.0", nullable=False),
        sa.Column("cost_per_user_daily_alert", sa.Numeric(10, 2), server_default="10.0", nullable=False),
    )
    op.execute("INSERT INTO platform_settings (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("platform_settings")
