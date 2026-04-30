"""add account lockout columns + auth_events table

Adds three columns to ``users`` to support account-level login lockout:
- ``failed_login_count``: consecutive bad-password attempt counter
- ``locked_until``: timestamp until which login is blocked (NULL = not locked)
- ``last_failed_login_at``: timestamp of the most recent failure (used for auto-reset)

Also adds a partial index on ``locked_until`` for efficient locked-account queries.

Creates the ``auth_events`` audit table consumed by the shared
``platform_shared.db.models.auth_event.AuthEvent`` model. This is the same
schema MyBookkeeper uses (revisions ``652c2754ae61`` + ``e3bc2531d23e``)
collapsed into a single migration since MyJobHunter does not have an
``auth_events`` table yet.

Revision ID: a1b2c3d4e5f6
Revises: 0001
Create Date: 2026-04-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Account lockout columns on users ----
    op.add_column(
        "users",
        sa.Column(
            "failed_login_count",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "users",
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_failed_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Partial index — only indexes rows that are actually locked.
    op.execute(
        "CREATE INDEX ix_users_locked_until ON users (locked_until) "
        "WHERE locked_until IS NOT NULL"
    )

    # ---- auth_events audit table ----
    op.create_table(
        "auth_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("succeeded", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_auth_events_user_id", "auth_events", ["user_id"])
    op.create_index("ix_auth_events_event_type", "auth_events", ["event_type"])
    op.create_index("ix_auth_events_created_at", "auth_events", ["created_at"])
    op.create_index(
        "ix_auth_events_user_event_time",
        "auth_events",
        ["user_id", "event_type", "created_at"],
    )
    op.create_index(
        "ix_auth_events_ip_time",
        "auth_events",
        ["ip_address", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_events_ip_time", table_name="auth_events")
    op.drop_index("ix_auth_events_user_event_time", table_name="auth_events")
    op.drop_index("ix_auth_events_created_at", table_name="auth_events")
    op.drop_index("ix_auth_events_event_type", table_name="auth_events")
    op.drop_index("ix_auth_events_user_id", table_name="auth_events")
    op.drop_table("auth_events")

    op.execute("DROP INDEX IF EXISTS ix_users_locked_until")
    op.drop_column("users", "last_failed_login_at")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")
