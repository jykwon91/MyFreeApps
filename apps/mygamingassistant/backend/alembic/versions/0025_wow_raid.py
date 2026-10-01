"""Add wow_raid_* tables — Discord raid signup bot data layer

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-01 00:00:00.000000

WHY.  The WoW Forever feature is gaining an HTTP-interactions Discord bot for
raid signups.  These five tables hold:

raid_key includes the WoW Forever launch raids (barrow_deeps, hyjal_summit)
plus the full Classic-era progression list (mc → naxx).
  wow_raid_guild        — per-Discord-guild bot configuration
  wow_raid_event        — a scheduled raid (starts_at, raid_key, size_cap …)
  wow_raid_signup       — one player's signup for an event
  wow_raid_member_pref  — remembered class/role per player per guild
  wow_raid_notification — outbox of scheduled bot messages (nudges, reminders)

No FK to the MGA user table; tenant scope is the Discord guild snowflake.
Snowflake IDs stored as String(32) — never as integers (exceed JS safe-int).

See app/models/wow/wow_raid_*.py for the full column contracts.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Enum values (mirrored from the model constants)
# ---------------------------------------------------------------------------
_RAID_KEYS = (
    # WoW Forever launch raids (Dec 9 patch)
    "barrow_deeps",
    "hyjal_summit",
    # Classic-era raids (added progressively)
    "mc",
    "onyxia",
    "bwl",
    "zg",
    "aq20",
    "aq40",
    "naxx",
)
_RAID_STATUSES = ("scheduled", "cancelled", "completed")
_WOW_CLASSES = (
    "warrior", "paladin", "hunter", "rogue", "priest",
    "shaman", "mage", "warlock", "druid",
)
_RAID_ROLES = ("tank", "healer", "dps")
_SIGNUP_STATUSES = ("confirmed", "tentative", "bench", "late", "declined")
_NOTIF_KINDS = (
    "signup_nudge", "consumables_reminder", "ready_check", "raid_cancelled"
)
# Use json_build_object rather than a JSONB string literal to avoid
# SQLAlchemy text() treating the colons in JSON "key":value pairs as
# bind-parameter prefixes (`:1440` → NULL in offline rendering).
_DEFAULT_SETTINGS_SQL = (
    "json_build_object("
    "'nudge_offsets_minutes', json_build_array(2880, 1440), "
    "'consumables_reminder_minutes', 1440, "
    "'ready_check_minutes', 60"
    ")"
)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. wow_raid_guild
    # ------------------------------------------------------------------
    op.create_table(
        "wow_raid_guild",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("discord_guild_id", sa.String(32), nullable=False),
        sa.Column("raid_channel_id", sa.String(32), nullable=True),
        sa.Column("ping_role_id", sa.String(32), nullable=True),
        sa.Column(
            "timezone", sa.String(64), server_default="UTC", nullable=False
        ),
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text(_DEFAULT_SETTINGS_SQL),
            nullable=False,
        ),
        sa.Column("configured_by_user_id", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_guild"),
        sa.UniqueConstraint(
            "discord_guild_id", name="uq_wowraidguild_discord_guild_id"
        ),
        sa.CheckConstraint(
            "char_length(discord_guild_id) >= 1",
            name="ck_wowraidguild_discord_guild_id_nonempty",
        ),
    )

    # ------------------------------------------------------------------
    # 2. wow_raid_event
    # ------------------------------------------------------------------
    op.create_table(
        "wow_raid_event",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "guild_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("raid_key", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("size_cap", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            server_default="scheduled",
            nullable=False,
        ),
        sa.Column("channel_id", sa.String(32), nullable=False),
        sa.Column("message_id", sa.String(32), nullable=True),
        sa.Column("created_by_user_id", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_event"),
        sa.ForeignKeyConstraint(
            ["guild_id"],
            ["wow_raid_guild.id"],
            name="fk_wowraidevent_guild",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            f"raid_key IN {_RAID_KEYS!r}",
            name="ck_wowraidevent_raid_key",
        ),
        sa.CheckConstraint(
            f"status IN {_RAID_STATUSES!r}",
            name="ck_wowraidevent_status",
        ),
        sa.CheckConstraint(
            "size_cap >= 1 AND size_cap <= 40",
            name="ck_wowraidevent_size_cap",
        ),
    )
    op.create_index(
        "ix_wowraidevent_guild_id", "wow_raid_event", ["guild_id"]
    )
    op.create_index(
        "ix_wowraidevent_guild_starts_at",
        "wow_raid_event",
        ["guild_id", "starts_at"],
    )

    # ------------------------------------------------------------------
    # 3. wow_raid_signup
    # ------------------------------------------------------------------
    op.create_table(
        "wow_raid_signup",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("discord_user_id", sa.String(32), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("wow_class", sa.String(20), nullable=True),
        sa.Column("role", sa.String(10), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            server_default="confirmed",
            nullable=False,
        ),
        sa.Column(
            "signed_up_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_signup"),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["wow_raid_event.id"],
            name="fk_wowraidsignup_event",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "event_id", "discord_user_id", name="uq_wowraidsignup_event_user"
        ),
        sa.CheckConstraint(
            f"wow_class IS NULL OR wow_class IN {_WOW_CLASSES!r}",
            name="ck_wowraidsignup_wow_class",
        ),
        sa.CheckConstraint(
            f"role IS NULL OR role IN {_RAID_ROLES!r}",
            name="ck_wowraidsignup_role",
        ),
        sa.CheckConstraint(
            f"status IN {_SIGNUP_STATUSES!r}",
            name="ck_wowraidsignup_status",
        ),
    )
    op.create_index(
        "ix_wowraidsignup_event_id", "wow_raid_signup", ["event_id"]
    )

    # ------------------------------------------------------------------
    # 4. wow_raid_member_pref
    # ------------------------------------------------------------------
    op.create_table(
        "wow_raid_member_pref",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "guild_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("discord_user_id", sa.String(32), nullable=False),
        sa.Column("default_wow_class", sa.String(20), nullable=True),
        sa.Column("default_role", sa.String(10), nullable=True),
        sa.Column(
            "dm_opt_out",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_member_pref"),
        sa.ForeignKeyConstraint(
            ["guild_id"],
            ["wow_raid_guild.id"],
            name="fk_wowraidmemberpref_guild",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "guild_id",
            "discord_user_id",
            name="uq_wowraidmemberpref_guild_user",
        ),
        sa.CheckConstraint(
            f"default_wow_class IS NULL OR default_wow_class IN {_WOW_CLASSES!r}",
            name="ck_wowraidmemberpref_wow_class",
        ),
        sa.CheckConstraint(
            f"default_role IS NULL OR default_role IN {_RAID_ROLES!r}",
            name="ck_wowraidmemberpref_role",
        ),
    )
    op.create_index(
        "ix_wowraidmemberpref_guild_id", "wow_raid_member_pref", ["guild_id"]
    )

    # ------------------------------------------------------------------
    # 5. wow_raid_notification
    # ------------------------------------------------------------------
    op.create_table(
        "wow_raid_notification",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("target_user_id", sa.String(32), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "attempts", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wow_raid_notification"),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["wow_raid_event.id"],
            name="fk_wowraidnotif_event",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            f"kind IN {_NOTIF_KINDS!r}",
            name="ck_wowraidnotif_kind",
        ),
    )
    # event_id FK index
    op.create_index(
        "ix_wowraidnotif_event_id", "wow_raid_notification", ["event_id"]
    )
    # Partial unique — channel posts (target_user_id IS NULL)
    op.create_index(
        "uq_wowraidnotif_channel_post",
        "wow_raid_notification",
        ["event_id", "kind", "due_at"],
        unique=True,
        postgresql_where=sa.text("target_user_id IS NULL"),
    )
    # Partial unique — per-user DMs (target_user_id IS NOT NULL)
    op.create_index(
        "uq_wowraidnotif_user_notif",
        "wow_raid_notification",
        ["event_id", "kind", "target_user_id", "due_at"],
        unique=True,
        postgresql_where=sa.text("target_user_id IS NOT NULL"),
    )
    # Covering index for claim_due — only pending rows
    op.create_index(
        "ix_wowraidnotif_due_pending",
        "wow_raid_notification",
        ["due_at"],
        postgresql_where=sa.text("sent_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("wow_raid_notification")
    op.drop_table("wow_raid_member_pref")
    op.drop_table("wow_raid_signup")
    op.drop_table("wow_raid_event")
    op.drop_table("wow_raid_guild")
