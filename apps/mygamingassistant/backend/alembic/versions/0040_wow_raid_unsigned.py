"""wow_raid unsigned (Raid: Unsigned — who hasn't signed up, and pinging them)

Revision ID: 0040
Revises: 0039
Create Date: 2026-10-02 23:50:00.000000

WHY.  Raid-Helper shows a leader who hasn't signed up yet and pings them.
"Who should have" is the people holding the raid's raider roles: the roles
picked for the raid, else the server's default, else the roles the raid
pings.  The member list is read from Discord when a leader looks (it needs
the Server Members intent); nothing about members is stored.

On ``wow_raid_guild``:

* ``raider_role_ids`` — the server's default raider roles (``/raid-admin
  raiders``); null when none are set.  A JSON array of role ids.

On ``wow_raid_event``:

* ``raider_role_ids`` — the roles picked for this raid; null = the default.
  A JSON array of role ids; repeats copy it.
* ``unsigned_pinged_at`` — the Unsigned [Ping them] slot, claimed under the
  raid's row lock like ``last_pinged_at`` (one ping per raid per 5 minutes);
  repeats don't copy it.

Both arrays are checked to be arrays (null stays SQL NULL).  Downgrade drops
the checks and the columns: the picked roles are lost.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_guild", sa.Column("raider_role_ids", postgresql.JSONB(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("raider_role_ids", postgresql.JSONB(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("unsigned_pinged_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_wowraidguild_raider_role_ids",
        "wow_raid_guild",
        "raider_role_ids IS NULL OR jsonb_typeof(raider_role_ids) = 'array'",
    )
    op.create_check_constraint(
        "ck_wowraidevent_raider_role_ids",
        "wow_raid_event",
        "raider_role_ids IS NULL OR jsonb_typeof(raider_role_ids) = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_wowraidevent_raider_role_ids", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidguild_raider_role_ids", "wow_raid_guild", type_="check")
    op.drop_column("wow_raid_event", "unsigned_pinged_at")
    op.drop_column("wow_raid_event", "raider_role_ids")
    op.drop_column("wow_raid_guild", "raider_role_ids")
