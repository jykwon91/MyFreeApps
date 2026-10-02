"""wow_raid repeating raids (Raid: Edit → Repeat)

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-02 22:00:00.000000

WHY.  Raid-Helper posts recurring events ahead on a schedule; MGA leaders
made the same raid again by hand every week.  A **repeat** posts a copy of
the latest raid in it every N days, a set time before each start.

* ``wow_raid_series`` — one row per repeat: its guild (CASCADE), the
  interval (``every_days``, 1–28), how long before each start a raid posts
  (``post_ahead_hours``; null = one interval, "when the one before
  starts"; never longer than the interval, so at most one raid waits ahead),
  the next raid not yet posted (``next_starts_at``) at its wall-clock time
  and timezone (``start_local``, ``tz_name``: 8:00pm stays 8:00pm across
  DST), and who turned it on (DMed if it stops).
* ``wow_raid_event.series_id`` — the repeat a raid is in: set on the raid
  it was turned on from and on every raid it posted.  ON DELETE SET NULL:
  stopping a repeat leaves its raids as plain raids.

No unique (series_id, starts_at): a leader's one-off move could collide
with a slot and wedge the worker.  No index on ``next_starts_at``: one row
per repeat, read once a tick like ``complete_started_events``.  Downgrade
drops both: repeats are lost, their raids stay.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wow_raid_series",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("guild_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("every_days", sa.Integer(), nullable=False),
        sa.Column("post_ahead_hours", sa.Integer(), nullable=True),
        sa.Column("next_starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("start_local", sa.Time(), nullable=False),
        sa.Column("tz_name", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_series"),
        sa.ForeignKeyConstraint(
            ["guild_id"], ["wow_raid_guild.id"], name="fk_wowraidseries_guild", ondelete="CASCADE"
        ),
        sa.CheckConstraint("every_days BETWEEN 1 AND 28", name="ck_wowraidseries_every_days"),
        sa.CheckConstraint(
            "post_ahead_hours IS NULL OR (post_ahead_hours BETWEEN 1 AND 336 AND post_ahead_hours <= every_days * 24)",
            name="ck_wowraidseries_post_ahead",
        ),
    )
    op.create_index("ix_wowraidseries_guild_id", "wow_raid_series", ["guild_id"])
    op.add_column("wow_raid_event", sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_wowraidevent_series", "wow_raid_event", "wow_raid_series", ["series_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_wowraidevent_series_id", "wow_raid_event", ["series_id"])


def downgrade() -> None:
    # Repeats are lost; the raids they posted stay as plain raids.
    op.drop_index("ix_wowraidevent_series_id", table_name="wow_raid_event")
    op.drop_constraint("fk_wowraidevent_series", "wow_raid_event", type_="foreignkey")
    op.drop_column("wow_raid_event", "series_id")
    op.drop_index("ix_wowraidseries_guild_id", table_name="wow_raid_series")
    op.drop_table("wow_raid_series")
