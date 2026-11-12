"""Add wow_guild, character guild membership and known recipes

Revision ID: 0055
Revises: 0054
Create Date: 2026-11-12 00:00:00.000000

WHY. The guild dashboard, leaderboards and recipe search read stored data,
not Blizzard, on every view. A looked-up character now records its guild
(``wow_guild``, ``wow_character.guild_id``) and the recipes it knows
(``wow_recipe`` + ``wow_character_recipe``); a scheduled job refreshes each
watched guild's roster and every member's character. See
``app/services/wow/guild/guild_roster_service.py``. New tables start empty;
the two new ``wow_character`` columns are nullable. Additive only.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0055"
down_revision: Union[str, None] = "0054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wow_guild",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("blizzard_guild_id", sa.BigInteger(), nullable=False),
        sa.Column("slug", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("faction", sa.String(length=10), nullable=False),
        sa.Column("member_count", sa.SmallInteger(), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("roster_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("roster_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gone_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blizzard_guild_id"),
        sa.CheckConstraint("slug = lower(slug)", name="ck_wowguild_slug_lower"),
        sa.CheckConstraint("faction IN ('ALLIANCE', 'HORDE')", name="ck_wowguild_faction"),
    )
    op.create_index(
        "uq_wowguild_slug_live", "wow_guild", ["slug"], unique=True, postgresql_where=sa.text("gone_at IS NULL"),
    )
    op.create_index("ix_wowguild_last_viewed_at", "wow_guild", ["last_viewed_at"])

    op.add_column("wow_character", sa.Column("guild_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("wow_character", sa.Column("guild_rank", sa.SmallInteger(), nullable=True))
    op.create_foreign_key(
        "fk_wowcharacter_guild_id", "wow_character", "wow_guild", ["guild_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_wowcharacter_guild_id", "wow_character", ["guild_id"])

    op.create_table(
        "wow_recipe",
        sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("profession_id", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wowrecipe_profession_id", "wow_recipe", ["profession_id"])

    op.create_table(
        "wow_character_recipe",
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["wow_character.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipe_id"], ["wow_recipe.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("character_id", "recipe_id"),
    )
    op.create_index("ix_wowcharacterrecipe_recipe_id", "wow_character_recipe", ["recipe_id"])


def downgrade() -> None:
    op.drop_index("ix_wowcharacterrecipe_recipe_id", table_name="wow_character_recipe")
    op.drop_table("wow_character_recipe")
    op.drop_index("ix_wowrecipe_profession_id", table_name="wow_recipe")
    op.drop_table("wow_recipe")
    op.drop_index("ix_wowcharacter_guild_id", table_name="wow_character")
    op.drop_constraint("fk_wowcharacter_guild_id", "wow_character", type_="foreignkey")
    op.drop_column("wow_character", "guild_rank")
    op.drop_column("wow_character", "guild_id")
    op.drop_index("ix_wowguild_last_viewed_at", table_name="wow_guild")
    op.drop_index("uq_wowguild_slug_live", table_name="wow_guild")
    op.drop_table("wow_guild")
