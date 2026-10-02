"""wow_raid advanced (Raid: Edit → Advanced — minimum sign-ups, who can sign up, ready check)

Revision ID: 0041
Revises: 0040
Create Date: 2026-10-02 23:55:00.000000

WHY.  Raid-Helper's advanced settings let a leader cancel a raid that
doesn't fill, say who may sign up, and move the ready check.  A raid with
no value of its own follows the server's (``/raid-admin advanced``), read
every time, so a server change reaches every raid that follows it.

On ``wow_raid_event`` (null = follow the server, unless said otherwise):

* ``min_signups`` — cancel the raid if fewer than this many have a seat
  when sign-ups close (1–40); raid-only, null = no minimum.
* ``signup_role_ids`` — only these roles may join; ``[]`` = everyone.
* ``banned_role_ids`` — these roles may not join; ``[]`` = nobody.
* ``ready_check_minutes`` — how long before the start the ready check goes
  out (5–1440), or 0 for none.

On ``wow_raid_guild``: ``signup_role_ids`` / ``banned_role_ids``, the
server's defaults (null = everyone / nobody).  The server's ready check
stays in ``settings.ready_check_minutes``.

Repeats copy all four raid columns.  Role lists are JSON arrays of role ids,
checked to be arrays (null stays SQL NULL).  Nothing is backfilled: every
raid starts out following the server.  Downgrade drops the checks and the
columns: the settings are lost.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None

_ARRAY = "{column} IS NULL OR jsonb_typeof({column}) = 'array'"


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("min_signups", sa.Integer(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("signup_role_ids", postgresql.JSONB(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("banned_role_ids", postgresql.JSONB(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("ready_check_minutes", sa.Integer(), nullable=True))
    op.add_column("wow_raid_guild", sa.Column("signup_role_ids", postgresql.JSONB(), nullable=True))
    op.add_column("wow_raid_guild", sa.Column("banned_role_ids", postgresql.JSONB(), nullable=True))
    op.create_check_constraint(
        "ck_wowraidevent_min_signups", "wow_raid_event", "min_signups IS NULL OR min_signups BETWEEN 1 AND 40"
    )
    op.create_check_constraint(
        "ck_wowraidevent_signup_role_ids", "wow_raid_event", _ARRAY.format(column="signup_role_ids")
    )
    op.create_check_constraint(
        "ck_wowraidevent_banned_role_ids", "wow_raid_event", _ARRAY.format(column="banned_role_ids")
    )
    op.create_check_constraint(
        "ck_wowraidevent_ready_check_minutes",
        "wow_raid_event",
        "ready_check_minutes IS NULL OR ready_check_minutes = 0 OR ready_check_minutes BETWEEN 5 AND 1440",
    )
    op.create_check_constraint(
        "ck_wowraidguild_signup_role_ids", "wow_raid_guild", _ARRAY.format(column="signup_role_ids")
    )
    op.create_check_constraint(
        "ck_wowraidguild_banned_role_ids", "wow_raid_guild", _ARRAY.format(column="banned_role_ids")
    )


def downgrade() -> None:
    op.drop_constraint("ck_wowraidguild_banned_role_ids", "wow_raid_guild", type_="check")
    op.drop_constraint("ck_wowraidguild_signup_role_ids", "wow_raid_guild", type_="check")
    op.drop_constraint("ck_wowraidevent_ready_check_minutes", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_banned_role_ids", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_signup_role_ids", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_min_signups", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_guild", "banned_role_ids")
    op.drop_column("wow_raid_guild", "signup_role_ids")
    op.drop_column("wow_raid_event", "ready_check_minutes")
    op.drop_column("wow_raid_event", "banned_role_ids")
    op.drop_column("wow_raid_event", "signup_role_ids")
    op.drop_column("wow_raid_event", "min_signups")
