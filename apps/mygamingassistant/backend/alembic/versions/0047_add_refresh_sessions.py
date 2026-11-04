"""Add refresh_sessions: one row per signed-in mobile device

Revision ID: 0047
Revises: 0046
Create Date: 2026-11-03 00:00:00.000000

Nothing uses the table yet. Rows hold only hashes of refresh secrets.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0047"
down_revision: Union[str, None] = "0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_sessions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("current_secret_hash", sa.String(64), nullable=False),
        sa.Column("previous_secret_hash", sa.String(64), nullable=True),
        sa.Column("previous_valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("device_name", sa.String(100), nullable=True),
        sa.Column("auth_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_used_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_sessions_user_id", table_name="refresh_sessions")
    op.drop_table("refresh_sessions")
