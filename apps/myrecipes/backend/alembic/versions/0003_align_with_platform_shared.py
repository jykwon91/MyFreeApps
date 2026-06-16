"""Align platform tables with platform_shared models -- names, schemas, enum

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-16 00:00:00.000000

``0001_initial_schema.py`` was copied verbatim from the shared scaffold
template (``infra/templates/scaffold/backend/alembic/versions/0001_initial_schema.py``),
which predates platform_shared promoting the AuditLog + AuthEvent models to
their canonical shapes and the User.role column adopting the postgres
``user_role`` ENUM. The scaffold's 0001 therefore provisions platform tables
that do NOT match the models myrecipes imports, so:

  * the first auth INSERT fails with ``type "user_role" does not exist``
    (User.role binds ``SAEnum(Role, name="user_role")``, but 0001 created the
    column as ``String(20)`` with a check constraint), and
  * auth-event writes fail with ``relation "auth_events" does not exist``
    (the model is ``__tablename__ = "auth_events"`` plural; 0001 created
    singular ``auth_event``).

These code paths only execute against a real Postgres, so the drift went
undetected until myrecipes was added to CI (PR #884) -- ``test_recipes.py``
had never run anywhere before.

This migration applies the same alignment MyPizzaTracker (0004) and
MyGamingAssistant (0004) already carry:

  1. ``audit_log`` (singular) -> ``audit_logs`` (plural, per
     ``platform_shared.db.models.audit_log.AuditLog``). Schema rebuilt to the
     model's shape: Integer autoincrement id, table_name / record_id /
     operation / field_name / old_value / new_value / changed_by / changed_at.
     The original UUID/user_id/row_id/old_values/new_values shape did not match
     what ``platform_shared.core.audit``'s listener writes, so audit writes
     were failing against the wrong column names.
  2. ``auth_event`` (singular) -> ``auth_events`` (plural, per
     ``platform_shared.db.models.auth_event.AuthEvent``). Adds the missing
     ``succeeded`` column and renames ``metadata_json`` -> ``metadata`` (the
     model maps the ``event_metadata`` Python attr to the ``metadata`` SQL
     column).
  3. ``user.role`` switched from ``String(20) + CheckConstraint`` to the
     postgres ``user_role`` ENUM the User model's
     ``SAEnum(Role, name="user_role", values_callable=...)`` binding expects.
     The enum values are exactly those ``values_callable`` yields for
     ``platform_shared.core.permissions.Role`` (``admin``, ``user``) -- so the
     migrate path and a metadata ``create_all`` path produce an identical type.

Drops + recreates ``audit_log`` and ``auth_event`` rather than ALTER -- the
column shapes diverge too far for a clean ALTER, and myrecipes is not yet in
production (``automated_deploy: false``) so there is no data-loss concern.
Local dev DBs with the old shape should be rebuilt:
    alembic downgrade base && alembic upgrade head
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- audit_log (drift shape) -> audit_logs (model-matching shape) ----
    op.drop_index("ix_audit_log_user_id", table_name="audit_log")
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
    op.drop_table("audit_log")
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

    # ---- auth_event (drift shape) -> auth_events (model-matching shape) ----
    op.drop_index("ix_auth_event_user_id", table_name="auth_event")
    op.drop_index("ix_auth_event_event_type", table_name="auth_event")
    op.drop_index("ix_auth_event_created_at", table_name="auth_event")
    op.drop_table("auth_event")
    op.create_table(
        "auth_events",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
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

    # ---- user.role: String(20) + CheckConstraint -> postgres user_role ENUM ----
    # Values mirror platform_shared.core.permissions.Role exactly (admin, user)
    # -- the set the User model's ``values_callable`` produces.
    user_role_enum = sa.Enum("admin", "user", name="user_role")
    user_role_enum.create(op.get_bind(), checkfirst=True)
    op.drop_constraint("ck_user_role", "user", type_="check")
    op.execute('ALTER TABLE "user" ALTER COLUMN role DROP DEFAULT')
    op.execute('ALTER TABLE "user" ALTER COLUMN role TYPE user_role USING role::user_role')
    op.execute("ALTER TABLE \"user\" ALTER COLUMN role SET DEFAULT 'user'::user_role")


def downgrade() -> None:
    # ---- Revert user.role: user_role ENUM -> String(20) + CheckConstraint ----
    op.execute('ALTER TABLE "user" ALTER COLUMN role DROP DEFAULT')
    op.execute('ALTER TABLE "user" ALTER COLUMN role TYPE VARCHAR(20) USING role::text')
    op.execute("ALTER TABLE \"user\" ALTER COLUMN role SET DEFAULT 'user'")
    op.create_check_constraint(
        "ck_user_role", "user", "role IN ('user','admin','superuser')",
    )
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)

    # ---- Revert auth_events -> auth_event ----
    op.drop_index("ix_auth_events_ip_time", table_name="auth_events")
    op.drop_index("ix_auth_events_user_event_time", table_name="auth_events")
    op.drop_index("ix_auth_events_created_at", table_name="auth_events")
    op.drop_index("ix_auth_events_event_type", table_name="auth_events")
    op.drop_index("ix_auth_events_user_id", table_name="auth_events")
    op.drop_table("auth_events")
    op.create_table(
        "auth_event",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_auth_event_user_id", "auth_event", ["user_id"])
    op.create_index("ix_auth_event_event_type", "auth_event", ["event_type"])
    op.create_index("ix_auth_event_created_at", "auth_event", ["created_at"])

    # ---- Revert audit_logs -> audit_log ----
    op.drop_index("ix_audit_changed_at", table_name="audit_logs")
    op.drop_index("ix_audit_table_record", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.create_table(
        "audit_log",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("operation", sa.String(10), nullable=False),
        sa.Column("row_id", sa.Text(), nullable=True),
        sa.Column("old_values", postgresql.JSONB(), nullable=True),
        sa.Column("new_values", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])
