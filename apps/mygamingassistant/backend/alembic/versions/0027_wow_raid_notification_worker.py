"""wow_raid_notification: retry backoff + dm_fallback kind for the worker

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-01 00:00:00.000000

WHY.  The notification worker (``app/services/wow/raid_notification_worker.py``)
needs two things the 0025 outbox didn't have:

* ``next_attempt_at`` — after a 429/5xx/timeout the row is retried with an
  exponential backoff instead of on the very next 60-second tick, so a short
  Discord outage doesn't burn all ``MAX_ATTEMPTS`` in five minutes.
  ``claim_due`` skips rows whose ``next_attempt_at`` is in the future.  It
  is also how the DM fallback waits for the per-player DMs to finish.
* ``dm_fallback`` kind — ONE channel message per raid listing the players
  the consumables DM couldn't reach (Discord error 50007).  Making it its own
  outbox row gives it the same claim/idempotency guarantees as every other
  message: the channel-post partial unique index means it can only ever be
  scheduled once per raid.
"""
import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

_OLD_KINDS = ("signup_nudge", "consumables_reminder", "ready_check", "raid_cancelled")
_NEW_KINDS = (*_OLD_KINDS, "dm_fallback")


def upgrade() -> None:
    op.drop_constraint("ck_wowraidnotif_kind", "wow_raid_notification", type_="check")
    op.create_check_constraint(
        "ck_wowraidnotif_kind", "wow_raid_notification", f"kind IN {_NEW_KINDS!r}"
    )
    op.add_column(
        "wow_raid_notification",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wow_raid_notification", "next_attempt_at")
    # dm_fallback rows are transient worker bookkeeping; dropping them loses
    # at most one pending "I couldn't DM …" channel message per raid.
    op.execute("DELETE FROM wow_raid_notification WHERE kind = 'dm_fallback'")
    op.drop_constraint("ck_wowraidnotif_kind", "wow_raid_notification", type_="check")
    op.create_check_constraint(
        "ck_wowraidnotif_kind", "wow_raid_notification", f"kind IN {_OLD_KINDS!r}"
    )
