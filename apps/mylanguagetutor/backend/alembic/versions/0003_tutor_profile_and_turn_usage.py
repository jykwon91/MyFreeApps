"""tutor_profile (onboarding choices) + per-turn usage ledger columns

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-30 12:00:00.000000

- ``tutor_profile``: one row per user (PK = ``user_id``, FK ON DELETE CASCADE)
  holding the onboarding language + level. Its presence means "onboarded".
- ``tutor_turn.cache_write_tokens`` / ``tutor_turn.cost_units``: the rest of
  the per-turn usage ledger (``input_tokens`` / ``output_tokens`` /
  ``cache_read_tokens`` shipped in 0002).

CHECK value lists are frozen literals, as in 0002.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LANGUAGE_CODES = "('es')"
_LEVEL_CODES = "('beginner', 'some_phrases', 'conversational')"


def upgrade() -> None:
    op.create_table(
        "tutor_profile",
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False,
        ),
        sa.Column("language_code", sa.String(8), nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            f"language_code IN {_LANGUAGE_CODES}", name="ck_tutor_profile_language_code",
        ),
        sa.CheckConstraint(f"level IN {_LEVEL_CODES}", name="ck_tutor_profile_level"),
    )
    op.add_column(
        "tutor_turn",
        sa.Column("cache_write_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "tutor_turn",
        sa.Column("cost_units", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("tutor_turn", "cost_units")
    op.drop_column("tutor_turn", "cache_write_tokens")
    op.drop_table("tutor_profile")
