"""Add daily_usage_counters (shared platform_shared model) for the WoW item-reader cap

Revision ID: 0023
Revises: 0022
Create Date: 2026-09-22 00:00:00.000000

WHY. The WoW Forever item reader (POST /wow/items/extract) is public in the
serve-only production deployment and every call spends Claude API money. The
per-IP RateLimiter bounds one caller, but not total spend, and it lives in
process memory (resets on restart, per-worker). ``daily_usage_counters`` is the
durable global daily cap: one row per (bucket, UTC day), incremented atomically
by ``platform_shared.repositories.daily_quota_repo.try_consume_daily_quota``.

The model is owned by platform_shared (``DailyUsageCounter``); MGA provisions
the table here, the same ownership shape as ``auth_events`` / ``audit_logs``.
"""
import sqlalchemy as sa
from alembic import op


revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_usage_counters",
        sa.Column("bucket", sa.String(length=100), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("bucket", "day", name="pk_daily_usage_counters"),
    )


def downgrade() -> None:
    op.drop_table("daily_usage_counters")
