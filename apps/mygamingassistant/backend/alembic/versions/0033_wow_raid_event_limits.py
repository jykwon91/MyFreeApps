"""wow_raid_event: role and class limits (Raid: Edit → Role limits / Class limits)

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-02 08:00:00.000000

WHY.  Raid-Helper lets the leader cap how many players come as each role
and each class.  Two JSON objects on the raid hold the caps:

* ``role_limits`` — ``{"tank": 2, "healer": 4, …}``; keys tank, melee,
  ranged, healer.
* ``class_limits`` — ``{"rogue": 3, …}``; keys the nine classes (tank specs
  count under ``role_limits``, never here).

A missing key means no limit; null means none of that kind.  Values are
0–40 (checked in code; read through ``raid_limits.Limits.of``, which drops
anything else).  Nullable, no backfill: every existing raid stays
unlimited.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("role_limits", JSONB(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("class_limits", JSONB(), nullable=True))
    op.create_check_constraint(
        "ck_wowraidevent_role_limits",
        "wow_raid_event",
        "role_limits IS NULL OR jsonb_typeof(role_limits) = 'object'",
    )
    op.create_check_constraint(
        "ck_wowraidevent_class_limits",
        "wow_raid_event",
        "class_limits IS NULL OR jsonb_typeof(class_limits) = 'object'",
    )


def downgrade() -> None:
    # Raids go back to taking any role and class.
    op.drop_constraint("ck_wowraidevent_class_limits", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_role_limits", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_event", "class_limits")
    op.drop_column("wow_raid_event", "role_limits")
