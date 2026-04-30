"""add auth_events table

Adds the shared ``auth_events`` audit table to MyJobHunter so the app can
write security-relevant events (login success/failure, registration,
password reset, TOTP, OAuth connect/disconnect, account deletion, data
export). Schema mirrors the table provisioned in MyBookkeeper by
revision ``e3bc2531d23e`` so the same ``platform_shared.db.models.AuthEvent``
ORM model resolves against either app's database.

Notes
-----
- ``user_id`` deliberately has NO foreign key to ``users.id`` so event rows
  survive account deletion. The ``ACCOUNT_DELETED`` event is written BEFORE
  the cascade delete runs.
- ``metadata`` is the SQL column name; the ORM maps it to ``event_metadata``
  to avoid colliding with SQLAlchemy's ``DeclarativeBase.metadata``.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
