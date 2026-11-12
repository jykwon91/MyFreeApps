"""Add wow_character + daily metrics — WoW Forever characters persist

Revision ID: 0054
Revises: 0053
Create Date: 2026-11-12 00:00:00.000000

WHY. "Your character" only ever held Blizzard's answers in memory for a few
minutes. The guild dashboard and leaderboards need every looked-up
character's last sheet, and a daily history of its numbers, without asking
Blizzard for each member on every view. Each fetch now writes the character
(``wow_character``), that day's numbers (``wow_character_daily_metric``) and
its profession skills (``wow_character_profession_skill``). See
``app/services/wow/character/character_store_service.py``. Starts empty;
additive only.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0054"
down_revision: Union[str, None] = "0053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "wow_character",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("blizzard_character_id", sa.BigInteger(), nullable=False),
        sa.Column("slug", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("surname", sa.String(length=40), nullable=False),
        sa.Column("class_id", sa.SmallInteger(), nullable=False),
        sa.Column("sheet", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("sheet_version", sa.SmallInteger(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gone_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blizzard_character_id"),
        sa.CheckConstraint("slug = lower(slug)", name="ck_wowcharacter_slug_lower"),
    )
    op.create_index(
        "uq_wowcharacter_slug_live", "wow_character", ["slug"], unique=True,
        postgresql_where=sa.text("gone_at IS NULL"),
    )
    op.create_table(
        "wow_character_daily_metric",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("level", sa.SmallInteger(), nullable=False),
        sa.Column("item_level", sa.SmallInteger(), nullable=True),
        sa.Column("honorable_kills", sa.Integer(), nullable=True),
        sa.Column("killing_blows", sa.Integer(), nullable=True),
        sa.Column("deaths_from_players", sa.Integer(), nullable=True),
        sa.Column("total_kills", sa.Integer(), nullable=True),
        sa.Column("total_deaths", sa.Integer(), nullable=True),
        sa.Column("dungeons_done", sa.SmallInteger(), nullable=True),
        sa.Column("exalted_reputations", sa.SmallInteger(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["character_id"], ["wow_character.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("character_id", "day", name="uq_wowcharacterdailymetric_character_day"),
    )
    op.create_index("ix_wowcharacterdailymetric_day", "wow_character_daily_metric", ["day"])
    op.create_table(
        "wow_character_profession_skill",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("daily_metric_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profession_id", sa.Integer(), nullable=False),
        sa.Column("skill", sa.SmallInteger(), nullable=False),
        sa.Column("max_skill", sa.SmallInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["daily_metric_id"], ["wow_character_daily_metric.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "daily_metric_id", "profession_id", name="uq_wowcharacterprofessionskill_metric_profession",
        ),
    )


def downgrade() -> None:
    op.drop_table("wow_character_profession_skill")
    op.drop_index("ix_wowcharacterdailymetric_day", table_name="wow_character_daily_metric")
    op.drop_table("wow_character_daily_metric")
    op.drop_index("uq_wowcharacter_slug_live", table_name="wow_character")
    op.drop_table("wow_character")
