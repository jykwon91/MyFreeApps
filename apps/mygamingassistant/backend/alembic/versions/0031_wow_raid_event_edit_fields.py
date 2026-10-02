"""wow_raid_event: leader, image and color for the raid post's Edit menu

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-02 00:00:00.000000

WHY.  Raid-Helper's **Raid: Edit** menu lets a raid's leader change the
title, leader, date and time, description, banner image and color.  Title,
time and description already have columns; the rest are new:

* ``leader_user_id`` / ``leader_display_name`` — who leads the raid, once
  someone hands it over (null = whoever created it).  The leader may use
  the raid's leader tools; the post's author line names them.
* ``image_url`` — a banner link replacing the raid's own banner (null =
  the raid's banner).  https only, checked before it's saved.
* ``color`` — the post's stripe color while sign-ups are open (null = the
  default purple), 0x000000–0xFFFFFF.

All nullable, no backfill: every existing raid keeps its creator as leader
and the default look.
"""
import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("leader_user_id", sa.String(32), nullable=True))
    op.add_column("wow_raid_event", sa.Column("leader_display_name", sa.String(100), nullable=True))
    op.add_column("wow_raid_event", sa.Column("image_url", sa.String(512), nullable=True))
    op.add_column("wow_raid_event", sa.Column("color", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_wowraidevent_color",
        "wow_raid_event",
        "color IS NULL OR (color >= 0 AND color <= 16777215)",
    )


def downgrade() -> None:
    # Raids go back to their creator as leader and the default look.
    op.drop_constraint("ck_wowraidevent_color", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_event", "color")
    op.drop_column("wow_raid_event", "image_url")
    op.drop_column("wow_raid_event", "leader_display_name")
    op.drop_column("wow_raid_event", "leader_user_id")
