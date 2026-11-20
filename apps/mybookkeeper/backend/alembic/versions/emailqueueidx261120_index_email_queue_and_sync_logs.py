"""Index the email queue and sync logs for the queries that read them.

``email_queue`` had no index besides its unique key on
``(user_id, message_id, attachment_id)``, and its rows are never pruned, so
every read scanned the queue of every organization:

- ``(organization_id, status, created_at)`` serves the worker's
  oldest-pending / oldest-fetched claim (filter on org and status, oldest
  first) and every org + status filter (counts, resets, cancel, retry, the
  re-fetch exclusion list).
- ``(organization_id, created_at)`` serves the queue list every page polls
  (newest 100 for an org); a btree read backwards gives newest first.
- ``(sync_log_id, status)`` serves the per-sync status counts and the
  cascade delete from ``sync_logs``.

``sync_logs`` gets ``(organization_id, provider, started_at)`` for the recent
sync list (newest first per org and provider); its leading columns also serve
the running-sync count, timeout and cancel.

Revision ID: emailqueueidx261120
Revises: rentedsince261119
Create Date: 2026-11-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "emailqueueidx261120"
down_revision: str | None = "rentedsince261119"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_index(
        "ix_email_queue_org_status_created",
        "email_queue",
        ["organization_id", "status", "created_at"],
    )
    op.create_index(
        "ix_email_queue_org_created",
        "email_queue",
        ["organization_id", "created_at"],
    )
    op.create_index(
        "ix_email_queue_sync_log_status",
        "email_queue",
        ["sync_log_id", "status"],
    )
    op.create_index(
        "ix_sync_logs_org_provider_started",
        "sync_logs",
        ["organization_id", "provider", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_sync_logs_org_provider_started", table_name="sync_logs")
    op.drop_index("ix_email_queue_sync_log_status", table_name="email_queue")
    op.drop_index("ix_email_queue_org_created", table_name="email_queue")
    op.drop_index("ix_email_queue_org_status_created", table_name="email_queue")
