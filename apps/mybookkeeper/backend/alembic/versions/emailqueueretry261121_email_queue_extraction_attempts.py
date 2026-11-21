"""Track email extraction attempts and claims, and a sync's latest progress.

A Claude extraction that failed for a passing reason (rate limited, timed
out, an unreadable or cut-off reply) used to mark the row ``failed`` for
good: re-discovery's insert hits the unique key and does nothing, so the
email was never read again. Now the row goes back to ``fetched`` with
``next_attempt_at`` set, and only becomes ``failed`` once ``attempts``
reaches EMAIL_EXTRACTION_MAX_ATTEMPTS.

``email_queue.claimed_at`` stamps when a drain took the row, so a claim left
by a drain that died can be taken back once it is older than the longest a
read can take, while a live read is left alone. The drain that finishes a
read only writes its result while it still holds that claim, so a dismissal
or a reclaim made meanwhile is never undone.

``sync_logs.last_progress_at`` is touched as the sync works through its
emails, so a long sync that is still working is not marked "Timed out".

All columns are additive: existing rows start at 0 attempts with no retry
time and no claim time (an ``extracting`` row with no claim time counts as
abandoned), and a sync with no progress time falls back to its start.

Data, in the same transaction:

- Emails the old code lost to its own read timeout (``failed`` with the error
  it wrote, ``Extraction timed out``, the only transient error text the app
  itself wrote on the read path) go back to ``fetched`` with a full set of
  attempts, if their bytes are still stored. Rows that failed for any other
  reason are left alone. The count is printed. Their old sync logs are left
  as they ended (usually ``failed``): a log describes that run, which did end
  that way, and the email's next read belongs to the next sync. Recomputing
  the old status now, before the email is read again, would only swap one
  guess for another. (A later read still adds what it saves to the old log's
  ``records_added``, as any retried row does.)
- Rows the old code marked ``failed`` / ``Dismissed by user`` (dismissed
  mid-read) become the new ``dismissed`` status.
- ``chk_email_queue_status`` limits ``status`` to EMAIL_QUEUE_STATUSES
  (app/core/email_queue_enums.py), ``NOT VALID`` on Postgres: new writes are
  checked, existing rows are not scanned, so an unexpected legacy value can
  never fail the deploy. It is intentionally left unvalidated: before this
  revision ``status`` was a free string, so a legacy row with a value outside
  the list can't be ruled out, and a ``VALIDATE CONSTRAINT`` that met one
  would fail the deploy. Postgres still enforces it on every insert and
  update. Validate it in a later revision once production has been checked.

Downgrade puts ``dismissed`` rows back as ``failed`` / ``Dismissed by user``
(the old code has no such status) and drops the constraint and columns. The
re-queue is not undone: those rows are ordinary ``fetched`` rows the old code
reads as usual.

Revision ID: emailqueueretry261121
Revises: rentremattempt261121
Create Date: 2026-11-21 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "emailqueueretry261121"
down_revision: str | None = "rentremattempt261121"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# The error the old drain wrote on its own read timeout (reset_stuck in
# email_extraction_service before this revision).
_OLD_TIMEOUT_ERROR = "Extraction timed out"
# What the old dismiss wrote on a row it found mid-read.
_OLD_DISMISSED_ERROR = "Dismissed by user"

REQUEUE_TIMED_OUT_SQL = sa.text(
    "UPDATE email_queue SET status = 'fetched', attempts = 0, error = NULL, "
    "next_attempt_at = NULL, claimed_at = NULL "
    "WHERE status = 'failed' AND error = :error AND raw_content IS NOT NULL"
).bindparams(error=_OLD_TIMEOUT_ERROR)

MARK_DISMISSED_SQL = sa.text(
    "UPDATE email_queue SET status = 'dismissed', error = NULL WHERE status = 'failed' AND error = :error"
).bindparams(error=_OLD_DISMISSED_ERROR)

UNMARK_DISMISSED_SQL = sa.text(
    "UPDATE email_queue SET status = 'failed', error = :error WHERE status = 'dismissed'"
).bindparams(error=_OLD_DISMISSED_ERROR)

_STATUSES = (
    "'pending', 'fetching', 'fetched', 'extracting', 'done', "
    "'processed_as_booking', 'skipped', 'failed', 'dismissed'"
)


def upgrade() -> None:
    is_postgres = op.get_bind().dialect.name == "postgresql"
    if is_postgres:
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "email_queue",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "email_queue",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "email_queue",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sync_logs",
        sa.Column("last_progress_at", sa.DateTime(timezone=True), nullable=True),
    )

    bind = op.get_bind()
    requeued = bind.execute(REQUEUE_TIMED_OUT_SQL).rowcount
    print(f"  [backfill] Re-queued {requeued} email(s) that failed on the old read timeout")
    dismissed = bind.execute(MARK_DISMISSED_SQL).rowcount
    print(f"  [backfill] Marked {dismissed} email(s) dismissed mid-read as dismissed")

    if is_postgres:
        op.execute(
            "ALTER TABLE email_queue ADD CONSTRAINT chk_email_queue_status "
            f"CHECK (status IN ({_STATUSES})) NOT VALID"
        )


def downgrade() -> None:
    is_postgres = op.get_bind().dialect.name == "postgresql"
    if is_postgres:
        op.execute("SET LOCAL lock_timeout = '5s'")
        op.execute("ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS chk_email_queue_status")
    op.get_bind().execute(UNMARK_DISMISSED_SQL)
    op.drop_column("sync_logs", "last_progress_at")
    op.drop_column("email_queue", "claimed_at")
    op.drop_column("email_queue", "next_attempt_at")
    op.drop_column("email_queue", "attempts")
