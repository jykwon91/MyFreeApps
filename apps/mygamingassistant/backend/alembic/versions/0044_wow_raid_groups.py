"""wow_raid groups (the group planner: Raid: Edit → [Groups])

Revision ID: 0044
Revises: 0043
Create Date: 2026-10-03 09:00:00.000000

WHY.  Raid-Helper's composition tool sorts an event's players into groups
of five.  A leader plans them in the browser, on a link the bot mints
(Raid: Edit → [Groups]); published groups show on the raid's web page and
through [Groups] on the post.

On ``wow_raid_signup``:

* ``raid_group`` (1–8) and ``group_slot`` (1–5) — the player's place in the
  plan; both null outside a group (``ck_wowraidsignup_group_pair``).
* ``uq_wowraidsignup_group_slot`` — partial unique (event_id, raid_group,
  group_slot) WHERE raid_group IS NOT NULL: one player per slot.

A place counts only while its player holds a seat and its group is within
the raid's size (``raid_groups``); the next save clears stale ones.  The
sign-up writers never touch the pair.

On ``wow_raid_event`` (none copied):

* ``groups_version`` — +1 on every save: the planner's optimistic lock.
* ``groups_published_at`` — when the leader shared the groups; null = hidden.
* ``groups_updated_at`` — the last save.

``wow_raid_plan_link`` — a leader's 2-hour planner link for one raid.  Only
the SHA-256 of its token is kept.  One per (raid, leader): minting again
replaces it, and the unique (event_id, discord_user_id) leads with the FK,
so it doubles as the FK's index.  ON DELETE CASCADE from the raid.

Nothing is backfilled.  Downgrade drops the table, the index, the checks and
the columns: plans and links are lost.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wow_raid_signup", sa.Column("raid_group", sa.SmallInteger(), nullable=True))
    op.add_column("wow_raid_signup", sa.Column("group_slot", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "ck_wowraidsignup_group_pair", "wow_raid_signup", "(raid_group IS NULL) = (group_slot IS NULL)"
    )
    op.create_check_constraint(
        "ck_wowraidsignup_raid_group", "wow_raid_signup", "raid_group IS NULL OR raid_group BETWEEN 1 AND 8"
    )
    op.create_check_constraint(
        "ck_wowraidsignup_group_slot", "wow_raid_signup", "group_slot IS NULL OR group_slot BETWEEN 1 AND 5"
    )
    op.create_index(
        "uq_wowraidsignup_group_slot",
        "wow_raid_signup",
        ["event_id", "raid_group", "group_slot"],
        unique=True,
        postgresql_where=sa.text("raid_group IS NOT NULL"),
    )
    op.add_column(
        "wow_raid_event",
        sa.Column("groups_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("wow_raid_event", sa.Column("groups_published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wow_raid_event", sa.Column("groups_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "wow_raid_plan_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("discord_user_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_plan_link"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["wow_raid_event.id"], name="fk_wowraidplanlink_event", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("event_id", "discord_user_id", name="uq_wowraidplanlink_event_user"),
        sa.UniqueConstraint("token_hash", name="uq_wowraidplanlink_token_hash"),
        sa.CheckConstraint("expires_at > created_at", name="ck_wowraidplanlink_expiry"),
    )


def downgrade() -> None:
    op.drop_table("wow_raid_plan_link")
    op.drop_column("wow_raid_event", "groups_updated_at")
    op.drop_column("wow_raid_event", "groups_published_at")
    op.drop_column("wow_raid_event", "groups_version")
    op.drop_index("uq_wowraidsignup_group_slot", table_name="wow_raid_signup")
    op.drop_constraint("ck_wowraidsignup_group_slot", "wow_raid_signup", type_="check")
    op.drop_constraint("ck_wowraidsignup_raid_group", "wow_raid_signup", type_="check")
    op.drop_constraint("ck_wowraidsignup_group_pair", "wow_raid_signup", type_="check")
    op.drop_column("wow_raid_signup", "group_slot")
    op.drop_column("wow_raid_signup", "raid_group")
