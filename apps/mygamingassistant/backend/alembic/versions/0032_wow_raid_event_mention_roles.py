"""wow_raid_event: the roles a raid pings (create preview → More options → Mentions)

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-02 06:00:00.000000

WHY.  Raid-Helper lets the leader pick who a new raid pings.  Until now
every raid pinged the server's one ping role (``wow_raid_guild.ping_role_id``,
set by ``/raid-admin setup``).  ``mention_role_ids`` holds the roles this
raid pings instead — on its first post and in the "still need healers"
nudge:

* null — never picked: the server's ping role (if it has one).
* ``[]`` — picked nobody: the raid posts without a ping.
* ``["123", …]`` — these roles.

A JSON array of role ids (strings).  Nullable, no backfill: every existing
raid keeps following the server's ping role.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("mention_role_ids", JSONB(), nullable=True))
    op.create_check_constraint(
        "ck_wowraidevent_mention_role_ids",
        "wow_raid_event",
        "mention_role_ids IS NULL OR jsonb_typeof(mention_role_ids) = 'array'",
    )


def downgrade() -> None:
    # Raids go back to pinging the server's ping role.
    op.drop_constraint("ck_wowraidevent_mention_role_ids", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_event", "mention_role_ids")
