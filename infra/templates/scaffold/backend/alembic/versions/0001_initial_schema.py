"""Initial schema -- user + audit_logs + auth_events

Tier-1 platform tables only. App-specific domain tables go in later
revisions.

These tables MUST match the models the app imports: the ``User`` model binds
``role`` to ``SAEnum(Role, name="user_role")`` and ``app/models/__init__.py``
registers the shared ``AuditLog`` (``audit_logs``) + ``AuthEvent``
(``auth_events``) tables from platform_shared. An earlier version of this
template created ``role`` as ``String(20)`` and the audit/auth tables in the
singular, pre-promotion shape; apps rendered from it failed at the first auth
INSERT (``type "user_role" does not exist``) and on every auth-event write
(``relation "auth_events" does not exist``), and each had to add an
``align_with_platform_shared`` migration. This revision is the corrected
source so future apps are born matching the models.

Revision ID: 0001
Revises:
Create Date: 2026-05-13 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ user
    # Singular table name -- single-user app convention. (Multi-user apps that
    # mount the register router + the shared register test factory use the
    # plural ``users``; convert the table name when converting to multi-user.)
    #
    # ``role`` is the one column that uses a postgres ENUM rather than the
    # String+CheckConstraint convention: the shared User model binds
    # ``SAEnum(Role, name="user_role")``. Values mirror exactly what the
    # model's ``values_callable`` yields for
    # platform_shared.core.permissions.Role (``admin``, ``user``) so the
    # migrate path and a metadata ``create_all`` path produce an identical type.
    user_role = postgresql.ENUM("admin", "user", name="user_role", create_type=False)
    user_role.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "user",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("display_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("role", user_role, nullable=False, server_default="user"),
        sa.Column("totp_secret", sa.String(500), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("totp_recovery_codes", sa.String(1000), nullable=True),
        sa.Column("totp_algorithm", sa.String(10), nullable=False, server_default="sha1"),
        sa.Column("failed_login_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failed_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    # --------------------------------------------------------------- audit_logs
    # Matches platform_shared.db.models.audit_log.AuditLog (the shape
    # platform_shared.core.audit's listener writes).
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("record_id", sa.String(255), nullable=False),
        sa.Column("operation", sa.String(10), nullable=False),
        sa.Column("field_name", sa.String(255), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.String(255), nullable=True),
        sa.Column(
            "changed_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_audit_table_record", "audit_logs", ["table_name", "record_id"])
    op.execute("CREATE INDEX ix_audit_changed_at ON audit_logs (changed_at DESC)")

    # -------------------------------------------------------------- auth_events
    # Matches platform_shared.db.models.auth_event.AuthEvent. ``metadata`` is
    # the SQL column the model maps its ``event_metadata`` attr to.
    op.create_table(
        "auth_events",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # No FK to user -- events survive account deletion (intentional).
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column(
            "metadata", postgresql.JSONB(), nullable=False, server_default="{}",
        ),
        sa.Column("succeeded", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_auth_events_user_id", "auth_events", ["user_id"])
    op.create_index("ix_auth_events_event_type", "auth_events", ["event_type"])
    op.create_index("ix_auth_events_created_at", "auth_events", ["created_at"])
    op.create_index(
        "ix_auth_events_user_event_time", "auth_events",
        ["user_id", "event_type", "created_at"],
    )
    op.create_index("ix_auth_events_ip_time", "auth_events", ["ip_address", "created_at"])


def downgrade() -> None:
    op.drop_table("auth_events")
    op.drop_table("audit_logs")
    op.drop_table("user")
    postgresql.ENUM(name="user_role").drop(op.get_bind(), checkfirst=True)
