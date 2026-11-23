"""Index audit_logs by who made each change

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-23 00:00:00.000000

Deleting an account erases the values of the audit rows the user wrote
(platform_shared.repositories.audit_log_repo): it lists them by ``changed_by``,
then updates them by ``changed_by``, ``table_name`` and ``record_id``. With no
index on ``changed_by``, every deletion read the whole of audit_logs, which only
grows. With ``table_name`` and ``record_id`` after it, the listing reads only
the index.

This is a plain CREATE INDEX, not CONCURRENTLY: alembic runs each upgrade in a
transaction, where CONCURRENTLY can't run, and no migration here uses it.
Writes to audit_logs wait while the index builds; reads don't.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_audit_changed_by_record", "audit_logs", ["changed_by", "table_name", "record_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_changed_by_record", table_name="audit_logs")
