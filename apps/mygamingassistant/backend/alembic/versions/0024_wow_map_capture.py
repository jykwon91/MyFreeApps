"""Add wow_map_capture — World Map locations captured in WoW Forever

Revision ID: 0024
Revises: 0023
Create Date: 2026-09-23 00:00:00.000000

WHY. The WoW Forever World Map's NPC / quest / dungeon positions come from
Classic data and may be out of date in Forever. The MGA Companion addon
records what the operator actually sees in game; the operator imports the
addon's SavedVariables and those captures replace the Classic rows on the map.
Public content (no user FK), same shape as the lineup library. See
``app/models/wow/map_capture.py``.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

_KINDS = ("service", "quest_giver", "instance")
_SUBKINDS = (
    "class_trainer",
    "demon_trainer",
    "pet_trainer",
    "profession_trainer",
    "weapon_master",
    "riding_trainer",
    "flight_master",
    "banker",
    "auctioneer",
    "innkeeper",
    "stable_master",
    "repair",
    "npc",
    "object",
    "dungeon",
    "raid",
)
_FACTIONS = ("A", "H", "N")


def upgrade() -> None:
    op.create_table(
        "wow_map_capture",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("capture_key", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("subkind", sa.String(length=40), nullable=False),
        sa.Column("tag", sa.String(length=40), server_default="", nullable=False),
        sa.Column("npc_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=120), server_default="", nullable=False),
        sa.Column("zone_id", sa.Integer(), nullable=False),
        sa.Column("subzone", sa.String(length=120), server_default="", nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("faction", sa.String(length=1), nullable=False),
        sa.Column("quests", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_wow_map_capture"),
        sa.UniqueConstraint("capture_key", name="uq_wow_map_capture_capture_key"),
        sa.CheckConstraint(f"kind IN {_KINDS!r}", name="ck_wowmapcapture_kind"),
        sa.CheckConstraint(f"subkind IN {_SUBKINDS!r}", name="ck_wowmapcapture_subkind"),
        sa.CheckConstraint(f"faction IN {_FACTIONS!r}", name="ck_wowmapcapture_faction"),
        sa.CheckConstraint(
            "x >= 0 AND x <= 100 AND y >= 0 AND y <= 100",
            name="ck_wowmapcapture_coords",
        ),
    )


def downgrade() -> None:
    op.drop_table("wow_map_capture")
