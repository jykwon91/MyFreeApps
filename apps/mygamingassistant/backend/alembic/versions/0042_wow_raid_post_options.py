"""wow_raid post options (Raid: Edit → Advanced — pin the post, a voice channel, delete the post after the raid)

Revision ID: 0042
Revises: 0041
Create Date: 2026-10-03 02:30:00.000000

WHY.  Raid-Helper can pin a raid's post, name the raid's voice channel on
it, and delete the post once the raid is over.  As in 0041, a raid with no
value of its own follows the server's (``/raid-admin advanced``), read every
time.

On ``wow_raid_event``:

* ``pin_post`` — pin the post while the raid is still to start; null = the
  server's.
* ``pinned_message_id`` — the post the bot pinned.  The bot only ever unpins
  its own pin, and a repost (a new ``message_id``) no longer matches, so the
  new post gets pinned.
* ``voice_channel_id`` — the voice channel the post names; ``'0'`` = none on
  this raid although the server has one; null = the server's.
* ``delete_post_after_hours`` — delete the post this long after the raid
  ends (1–168); null = keep it.  Raid-only.
* ``post_deleted_at`` — when the bot deleted the post: the once-only stamp.
  The raid row stays.

On ``wow_raid_guild``: ``pin_posts`` (false) and ``voice_channel_id`` (null =
none), the server's defaults.

A partial index on ``starts_at`` holds the raids the delete sweep looks at (a
delay set, the post not deleted yet).  Repeats copy ``pin_post``,
``voice_channel_id`` and ``delete_post_after_hours``.  Nothing is backfilled.
Downgrade drops the index, the checks and the columns: the settings are lost,
and a pinned post stays pinned.
"""
import sqlalchemy as sa
from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_event", sa.Column("pin_post", sa.Boolean(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("pinned_message_id", sa.String(32), nullable=True))
    op.add_column("wow_raid_event", sa.Column("voice_channel_id", sa.String(32), nullable=True))
    op.add_column("wow_raid_event", sa.Column("delete_post_after_hours", sa.Integer(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("post_deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "wow_raid_guild", sa.Column("pin_posts", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    op.add_column("wow_raid_guild", sa.Column("voice_channel_id", sa.String(32), nullable=True))
    op.create_check_constraint(
        "ck_wowraidevent_pinned_message_id",
        "wow_raid_event",
        "pinned_message_id IS NULL OR pinned_message_id ~ '^[0-9]{15,20}$'",
    )
    op.create_check_constraint(
        "ck_wowraidevent_voice_channel_id",
        "wow_raid_event",
        "voice_channel_id IS NULL OR voice_channel_id ~ '^(0|[0-9]{15,20})$'",
    )
    op.create_check_constraint(
        "ck_wowraidevent_delete_post_after_hours",
        "wow_raid_event",
        "delete_post_after_hours IS NULL OR delete_post_after_hours BETWEEN 1 AND 168",
    )
    op.create_check_constraint(
        "ck_wowraidguild_voice_channel_id",
        "wow_raid_guild",
        "voice_channel_id IS NULL OR voice_channel_id ~ '^[0-9]{15,20}$'",
    )
    op.create_index(
        "ix_wowraidevent_post_delete_due",
        "wow_raid_event",
        ["starts_at"],
        postgresql_where=sa.text("delete_post_after_hours IS NOT NULL AND post_deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_wowraidevent_post_delete_due", table_name="wow_raid_event")
    op.drop_constraint("ck_wowraidguild_voice_channel_id", "wow_raid_guild", type_="check")
    op.drop_constraint("ck_wowraidevent_delete_post_after_hours", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_voice_channel_id", "wow_raid_event", type_="check")
    op.drop_constraint("ck_wowraidevent_pinned_message_id", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_guild", "voice_channel_id")
    op.drop_column("wow_raid_guild", "pin_posts")
    op.drop_column("wow_raid_event", "post_deleted_at")
    op.drop_column("wow_raid_event", "delete_post_after_hours")
    op.drop_column("wow_raid_event", "voice_channel_id")
    op.drop_column("wow_raid_event", "pinned_message_id")
    op.drop_column("wow_raid_event", "pin_post")
