"""wow_raid attendance (Raid: Signed → Attendance, /raid attendance, exports)

Revision ID: 0039
Revises: 0038
Create Date: 2026-10-02 23:30:00.000000

WHY.  Raid-Helper keeps attendance across finished events (``/attendance``)
and exports it (``/export``).  MGA forgot a raid once it finished.  Until a
raid finishes its sign-ups are its attendance; at completion (start + 6 h,
or earlier with [Record now]) the worker freezes them, one row per player,
and leaders correct the record (no-shows, walk-ins).  Stats are computed on
read over the last N counted raids; nothing is aggregated.

On ``wow_raid_event``:

* ``attendance_counted`` — whether the raid counts toward attendance (RH's
  ``attendance`` setting).  True for new raids; raids already completed are
  set to false here, so their records count only when a leader counts them.
* ``attendance_recorded_at`` — when its sign-ups were frozen; never cleared.
* ``ix_wowraidevent_attendance_due`` — partial, on ``starts_at`` where the
  raid is completed and not yet recorded: the sweep's query stays O(due).

``wow_raid_attendance`` — one row per player per raid: who, the name and
class when recorded, the sign-up's status (null = a leader added them), the
outcome, and the last leader change.  ON DELETE CASCADE from the raid; the
unique (event_id, discord_user_id) serves every read, so no other index.

Downgrade drops the table, the index and the columns: records are lost.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None

# Frozen copies of app.models.wow.wow_raid_attendance.ATTENDANCE_OUTCOMES and
# app.models.wow.wow_raid_signup.SIGNUP_STATUSES / WOW_CLASSES / CHARACTER_NAME_MAX.
_OUTCOMES = ("attended", "late", "standby", "tentative", "absent", "no_show")
_SIGNUP_STATUSES = ("confirmed", "late", "tentative", "bench", "queued", "absence")
_WOW_CLASSES = ("warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid")
_CHARACTER_NAME_MAX = 12


def upgrade() -> None:
    op.add_column(
        "wow_raid_event",
        sa.Column("attendance_counted", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("wow_raid_event", sa.Column("attendance_recorded_at", sa.DateTime(timezone=True), nullable=True))
    # Raids finished before attendance existed are recorded, but don't count.
    op.execute("UPDATE wow_raid_event SET attendance_counted = false WHERE status = 'completed'")
    op.create_index(
        "ix_wowraidevent_attendance_due",
        "wow_raid_event",
        ["starts_at"],
        postgresql_where=sa.text("status = 'completed' AND attendance_recorded_at IS NULL"),
    )
    op.create_table(
        "wow_raid_attendance",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("discord_user_id", sa.String(length=32), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("character_name", sa.String(length=_CHARACTER_NAME_MAX), nullable=True),
        sa.Column("wow_class", sa.String(length=20), nullable=True),
        sa.Column("signup_status", sa.String(length=20), nullable=True),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("marked_by_user_id", sa.String(length=32), nullable=True),
        sa.Column("marked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_attendance"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["wow_raid_event.id"], name="fk_wowraidattendance_event", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("event_id", "discord_user_id", name="uq_wowraidattendance_event_user"),
        sa.CheckConstraint(f"outcome IN {_OUTCOMES!r}", name="ck_wowraidattendance_outcome"),
        sa.CheckConstraint(
            f"signup_status IS NULL OR signup_status IN {_SIGNUP_STATUSES!r}",
            name="ck_wowraidattendance_signup_status",
        ),
        sa.CheckConstraint(
            f"wow_class IS NULL OR wow_class IN {_WOW_CLASSES!r}", name="ck_wowraidattendance_wow_class"
        ),
        sa.CheckConstraint("(marked_by_user_id IS NULL) = (marked_at IS NULL)", name="ck_wowraidattendance_marked"),
        sa.CheckConstraint(
            "signup_status IS NOT NULL OR marked_by_user_id IS NOT NULL", name="ck_wowraidattendance_source"
        ),
    )


def downgrade() -> None:
    # Attendance records are lost; the raids stay.
    op.drop_table("wow_raid_attendance")
    op.drop_index("ix_wowraidevent_attendance_due", table_name="wow_raid_event")
    op.drop_column("wow_raid_event", "attendance_recorded_at")
    op.drop_column("wow_raid_event", "attendance_counted")
