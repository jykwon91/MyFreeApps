"""Add audit_logs table (PR C2).

Adds the shared audit log table consumed from
``platform_shared.db.models.audit_log.AuditLog``. Schema must match the ORM
model exactly.

The ``auth_events`` table was already provisioned by PR C3
(revision ``a1b2c3d4e5f6``) as part of the account-lockout migration, so this
revision only owns the ``audit_logs`` half.

Revision ID: 0002
Revises: a1b2c3d4e5f6
Create Date: 2026-04-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_index("ix_audit_changed_at", table_name="audit_logs")
    op.drop_index("ix_audit_table_record", table_name="audit_logs")
    op.drop_table("audit_logs")
