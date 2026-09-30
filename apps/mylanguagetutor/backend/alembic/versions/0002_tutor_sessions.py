"""Tutor domain -- tutor_session + tutor_turn, plus shared daily_usage_counters

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-30 00:00:00.000000

- ``tutor_session``: one practice conversation (language + scenario + level).
  Tenant-scoped by ``user_id`` (FK ON DELETE CASCADE + index).
- ``tutor_turn``: learner text + tutor reply per turn, transcript columns
  encrypted at rest (EncryptedString -> unbounded VARCHAR holding Fernet
  ciphertext) with a sibling ``key_version``. ``user_id`` FK CASCADE + index;
  UNIQUE (session_id, seq).
- ``daily_usage_counters``: the opt-in platform_shared ``DailyUsageCounter``
  table (same shape as MyGamingAssistant 0023). The per-user token quota that
  consumes it lands with the tutor turns in PR 4.

The CHECK constraint value lists are FROZEN here as literals (a migration must
not change meaning when the registries later grow). Adding a language /
scenario / level / status requires a new migration that recreates the matching
constraint; ``tests/test_domain_registries.py`` compares the migrated database's
constraints against the registries and fails until it exists.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LANGUAGE_CODES = "('es')"
_SCENARIO_SLUGS = (
    "('greetings', 'repair-phrases', 'about-me', 'cafe', 'paying', "
    "'directions', 'likes-weekend', 'appointment', 'free-talk')"
)
_LEVEL_CODES = "('beginner', 'some_phrases', 'conversational')"
_SESSION_STATUS_CODES = "('active', 'ended')"
_TURN_STATUS_CODES = "('complete', 'partial', 'failed')"


def upgrade() -> None:
    # ------------------------------------------------------------ tutor_session
    op.create_table(
        "tutor_session",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("language_code", sa.String(8), nullable=False),
        sa.Column("scenario_slug", sa.String(40), nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("turn_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            f"language_code IN {_LANGUAGE_CODES}", name="ck_tutor_session_language_code",
        ),
        sa.CheckConstraint(
            f"scenario_slug IN {_SCENARIO_SLUGS}", name="ck_tutor_session_scenario_slug",
        ),
        sa.CheckConstraint(f"level IN {_LEVEL_CODES}", name="ck_tutor_session_level"),
        sa.CheckConstraint(
            f"status IN {_SESSION_STATUS_CODES}", name="ck_tutor_session_status",
        ),
    )
    op.create_index("ix_tutor_session_user_id", "tutor_session", ["user_id"])
    op.create_index(
        "ix_tutor_session_user_created", "tutor_session", ["user_id", "created_at"],
    )

    # --------------------------------------------------------------- tutor_turn
    op.create_table(
        "tutor_turn",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "session_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tutor_session.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("seq", sa.Integer(), nullable=False),
        # Encrypted (Fernet ciphertext) -- unbounded so ciphertext always fits.
        sa.Column("learner_text", sa.String(), nullable=False),
        sa.Column("reply_text", sa.String(), nullable=True),
        sa.Column("corrections_json", sa.String(), nullable=True),
        sa.Column("translation_text", sa.String(), nullable=True),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("session_id", "seq", name="uq_tutor_turn_session_seq"),
        sa.CheckConstraint(f"status IN {_TURN_STATUS_CODES}", name="ck_tutor_turn_status"),
    )
    op.create_index("ix_tutor_turn_user_id", "tutor_turn", ["user_id"])

    # ----------------------------------------------------- daily_usage_counters
    # platform_shared.db.models.daily_usage_counter.DailyUsageCounter.
    op.create_table(
        "daily_usage_counters",
        sa.Column("bucket", sa.String(length=100), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("bucket", "day", name="pk_daily_usage_counters"),
    )


def downgrade() -> None:
    op.drop_table("daily_usage_counters")
    op.drop_index("ix_tutor_turn_user_id", table_name="tutor_turn")
    op.drop_table("tutor_turn")
    op.drop_index("ix_tutor_session_user_created", table_name="tutor_session")
    op.drop_index("ix_tutor_session_user_id", table_name="tutor_session")
    op.drop_table("tutor_session")
