"""wow_raid Discord event + thread (Raid: Edit → Event & thread)

Revision ID: 0038
Revises: 0037
Create Date: 2026-10-02 23:00:00.000000

WHY.  Raid-Helper can put each event in the server's Events tab (its
``create_discordevent``) and open a thread under the post (``create_thread``).
MGA raids lived only in their post.  Each raid can now have both, off unless
the server's defaults or its leader turn them on.  On ``wow_raid_event``:

* ``discord_event_enabled`` / ``thread_enabled`` — the leader's toggles,
  copied from the server's defaults when the raid is made.
* ``length_minutes`` — how long the raid runs (15–360; null = 3 hours); it
  sets only the Discord event's end.
* ``discord_event_id`` / ``thread_id`` — what the bot made or adopted.
* ``discord_event_digest`` — the sha256 of the last payload Discord took, so
  an unchanged raid costs no PATCH; ``discord_event_starts_at`` — the start
  Discord holds (passed = Discord has started the event).
* ``discord_event_claimed_at`` — a create in flight: one event per raid even
  when two syncs race, and a timed-out create is looked for before another.
* ``thread_name`` — the name the bot gave its thread (null with an id: a
  member's thread, never renamed or archived).
* ``discord_event_error`` / ``thread_error`` — the code Discord refused with:
  the leader is told once and nothing retries until they ask.

On ``wow_raid_guild``: ``default_discord_event`` and ``default_thread``.

Everything defaults off, so old rows change nothing.  No index: every read is
by primary key.  Downgrade drops the columns; events and threads already made
stay in Discord.
"""
import sqlalchemy as sa
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wow_raid_event",
        sa.Column("discord_event_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "wow_raid_event", sa.Column("thread_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    op.add_column("wow_raid_event", sa.Column("length_minutes", sa.Integer(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("discord_event_id", sa.String(length=32), nullable=True))
    op.add_column("wow_raid_event", sa.Column("discord_event_digest", sa.String(length=64), nullable=True))
    op.add_column("wow_raid_event", sa.Column("discord_event_starts_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wow_raid_event", sa.Column("discord_event_claimed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wow_raid_event", sa.Column("discord_event_error", sa.Integer(), nullable=True))
    op.add_column("wow_raid_event", sa.Column("thread_id", sa.String(length=32), nullable=True))
    op.add_column("wow_raid_event", sa.Column("thread_name", sa.String(length=100), nullable=True))
    op.add_column("wow_raid_event", sa.Column("thread_error", sa.Integer(), nullable=True))
    op.add_column(
        "wow_raid_guild",
        sa.Column("default_discord_event", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "wow_raid_guild", sa.Column("default_thread", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    op.create_check_constraint(
        "ck_wowraidevent_length_minutes",
        "wow_raid_event",
        "length_minutes IS NULL OR length_minutes BETWEEN 15 AND 360",
    )


def downgrade() -> None:
    # Events and threads the bot made stay in Discord.
    op.drop_constraint("ck_wowraidevent_length_minutes", "wow_raid_event", type_="check")
    op.drop_column("wow_raid_guild", "default_thread")
    op.drop_column("wow_raid_guild", "default_discord_event")
    op.drop_column("wow_raid_event", "thread_error")
    op.drop_column("wow_raid_event", "thread_name")
    op.drop_column("wow_raid_event", "thread_id")
    op.drop_column("wow_raid_event", "discord_event_error")
    op.drop_column("wow_raid_event", "discord_event_claimed_at")
    op.drop_column("wow_raid_event", "discord_event_starts_at")
    op.drop_column("wow_raid_event", "discord_event_digest")
    op.drop_column("wow_raid_event", "discord_event_id")
    op.drop_column("wow_raid_event", "length_minutes")
    op.drop_column("wow_raid_event", "thread_enabled")
    op.drop_column("wow_raid_event", "discord_event_enabled")
