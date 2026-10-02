"""wow_raid sign-up deadline + start sweep (Raid: Edit → Deadline)

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-02 20:00:00.000000

WHY.  Raid-Helper closes an event's sign-ups a set time before it starts
(its ``deadline``), and its posts stop taking sign-ups once the raid has
begun.  MGA refused sign-ups at the start by the clock, but the post kept
its colour and live buttons.  Four columns on ``wow_raid_event``:

* ``signup_deadline_minutes`` — how long before the start sign-ups close
  (1–10080 minutes, i.e. at most 7 days); null = when the raid starts.
* ``close_reason`` — why ``closed_at`` is set: ``'leader'`` (Raid: Close)
  or ``'deadline'``; null while open.  Every raid closed so far was closed
  by its leader, so those are backfilled ``'leader'``.
* ``deadline_applied_at`` — when the bot applied the deadline (closed
  sign-ups, or found them closed already); null while it's ahead or unset.
  It makes the worker's deadline sweep once-only, and a reopen after the
  deadline stick.
* ``start_applied_at`` — when the worker re-rendered the post as started;
  cleared if the raid is moved into the future.

No CHECK pairs ``closed_at`` with ``close_reason``: code reads any reason
but ``'deadline'`` as the leader's.  No index either: the sweeps filter on
``status = 'scheduled'``, as ``complete_started_events`` already does every
tick.  Downgrade drops the columns: deadlines are lost, closed raids stay
closed.
"""
import sqlalchemy as sa
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("signup_deadline_minutes", sa.Integer(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("close_reason", sa.String(length=16), nullable=True))
    op.add_column("wow_raid_event", sa.Column("deadline_applied_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wow_raid_event", sa.Column("start_applied_at", sa.DateTime(timezone=True), nullable=True))
    # Until now only Raid: Close closed sign-ups.
    op.execute("UPDATE wow_raid_event SET close_reason = 'leader' WHERE closed_at IS NOT NULL")
    op.create_check_constraint(
        "ck_wowraidevent_signup_deadline",
        "wow_raid_event",
        "signup_deadline_minutes IS NULL OR signup_deadline_minutes BETWEEN 1 AND 10080",
    )
    op.create_check_constraint(
        "ck_wowraidevent_close_reason",
        "wow_raid_event",
        "close_reason IS NULL OR close_reason IN ('leader', 'deadline')",
    )


def downgrade() -> None:
    # Deadlines go with their column; closed raids stay closed.
    op.drop_constraint("ck_wowraidevent_close_reason", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_signup_deadline", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_event", "start_applied_at")
    op.drop_column("wow_raid_event", "deadline_applied_at")
    op.drop_column("wow_raid_event", "close_reason")
    op.drop_column("wow_raid_event", "signup_deadline_minutes")
