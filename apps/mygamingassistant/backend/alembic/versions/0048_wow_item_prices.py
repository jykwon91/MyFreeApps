"""Add wow_price_feed + wow_item_price — automatic auction-house prices

Revision ID: 0048
Revises: 0047
Create Date: 2026-11-06 00:00:00.000000

WHY. The WoW Forever pages (crafting routes, Cooking, food, Making gold) need
auction-house prices with no typing. A scheduled job pulls each region's prices
from a price source (TradeSkillMaster's public region files first) into these
tables; ``GET /api/wow/prices`` serves them. ``wow_price_feed`` is one
(game, region, ruleset, source) with its refresh state; ``wow_item_price`` is
one item in a feed. See ``app/models/wow/price_feed.py`` / ``item_price.py``.
Both start empty; the first refresh after boot fills them.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0048"
down_revision: Union[str, None] = "0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of app/core/wow_prices.py's lists, as SQL.
_REGIONS = "('us', 'eu', 'kr', 'tw')"
_SOURCES = "('tsm')"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "wow_price_feed",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("region", sa.String(length=4), nullable=False),
        sa.Column("ruleset", sa.String(length=40), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("etag", sa.String(length=200), nullable=True),
        sa.Column("last_modified", sa.String(length=100), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("item_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["game_id"], ["game.id"], ondelete="CASCADE"),
        sa.CheckConstraint(f"region IN {_REGIONS}", name="ck_wowpricefeed_region"),
        sa.CheckConstraint(f"source IN {_SOURCES}", name="ck_wowpricefeed_source"),
        sa.CheckConstraint("item_count >= 0", name="ck_wowpricefeed_item_count"),
        sa.UniqueConstraint(
            "game_id", "region", "ruleset", "source",
            name="uq_wowpricefeed_key",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_table(
        "wow_item_price",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("feed_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("market_value", sa.BigInteger(), nullable=False),
        sa.Column("historical", sa.BigInteger(), nullable=True),
        sa.Column("avg_sale_price", sa.BigInteger(), nullable=True),
        sa.Column("sale_rate", sa.Float(), nullable=True),
        sa.Column("sold_per_day", sa.Float(), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["feed_id"], ["wow_price_feed.id"], ondelete="CASCADE"),
        sa.CheckConstraint("item_id > 0", name="ck_wowitemprice_item_id"),
        sa.CheckConstraint("market_value >= 0", name="ck_wowitemprice_market_value"),
        sa.UniqueConstraint("feed_id", "item_id", name="uq_wowitemprice_feed_item"),
    )


def downgrade() -> None:
    op.drop_table("wow_item_price")
    op.drop_table("wow_price_feed")
