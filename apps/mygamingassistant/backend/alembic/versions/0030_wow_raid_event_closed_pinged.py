"""wow_raid_event: closed_at + last_pinged_at for the raid post's right-click menu

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-01 00:00:00.000000

WHY.  Raid-Helper's message context menu lets a raid's leader close and
reopen sign-ups and ping everyone signed up.  Both need a little state on
the event:

* ``closed_at`` — set by **Raid: Close**, cleared by **Raid: Open**.  A
  closed raid stays ``scheduled`` (the ready check, consumables DMs,
  /raid list and editing carry on); members' sign-up changes and the
  sign-up nudge stop.  A timestamp rather than a status so closing never
  interferes with the draft → scheduled → cancelled / completed lifecycle.
* ``last_pinged_at`` — when **Ping signed members** last went out, so a
  raid pings at most once every few minutes.

Both nullable, no backfill: every existing raid is open and never pinged.
"""
import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wow_raid_event", sa.Column("last_pinged_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Closed raids reopen on downgrade: the old code has no closed state.
    op.drop_column("wow_raid_event", "last_pinged_at")
    op.drop_column("wow_raid_event", "closed_at")
