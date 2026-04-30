"""Add audit_logs and auth_events tables (PR C2).

Adds the two shared security/audit tables consumed from
``platform_shared.db.models``. Schema must match the ORM models exactly.

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
    # ----------------------------------------------------------- audit_logs
    # Schema mirrors platform_shared.db.models.audit_log.AuditLog.
    # ``changed_by`` is a free-form String(255) with NO foreign key — audit
    # rows must survive user deletion. The shared model is the source of
    # truth for column types, nullability, and indexes.
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("record_id", sa.String(255), nullable=False),
        sa.Column("operation", sa.String(10), nullable=False),
        sa.Column("field_name", sa.String(255), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.String(255), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_table_record", "audit_logs", ["table_name", "record_id"])
    op.create_index("ix_audit_changed_at", "audit_logs", [sa.text("changed_at DESC")])

    # ----------------------------------------------------------- auth_events
    # Schema mirrors platform_shared.db.models.auth_event.AuthEvent.
    # ``user_id`` intentionally has NO foreign key to ``users.id`` so event
    # rows survive cascade-delete on account deletion. The
    # ``ACCOUNT_DELETED`` event is written BEFORE the user row is removed.
    op.create_table(
        "auth_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
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

    op.drop_index("ix_audit_changed_at", table_name="audit_logs")
    op.drop_index("ix_audit_table_record", table_name="audit_logs")
    op.drop_table("audit_logs")
