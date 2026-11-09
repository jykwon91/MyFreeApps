"""WoW Forever auction-house prices come from Blizzard, per auction house

Revision ID: 0052
Revises: 0051
Create Date: 2026-11-09 00:00:00.000000

WHY. Prices now come from Blizzard's Game Data API — the real auction-house
listings — instead of TradeSkillMaster's region-blended estimate. Every
Blizzard house is its own server market (one server's Alliance, Horde or
neutral Blackwater house), so prices are kept per house. The old source is
gone entirely, so:

* every stored price and feed is deleted (a third-party cache; the first
  refresh after deploy refills it from Blizzard);
* ``wow_price_feed`` loses what only the old source used — ``source`` (one
  source now), ``ruleset`` (every ruleset path returns the same data for a
  house id), ``etag`` / ``last_modified`` (its conditional GET) — and gains
  ``house_id`` (CHECK > 0) and ``faction`` (String + CHECK); the feed key is
  (game, region, house_id). Which server a house is lives in code
  (``PRICE_SERVER_HOUSES``), so mapping another server needs no migration;
* ``wow_item_price`` loses the old source's figures (``name``, ``historical``,
  ``avg_sale_price``, ``sale_rate``, ``sold_per_day``, per-row
  ``source_updated_at``) and gains the listing aggregates ``min_buyout``,
  ``quantity`` and ``listing_count``.

Downgrade restores the old shape, empty (the deleted prices are not restored).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0052"
down_revision: Union[str, None] = "0051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of app/core/wow_prices.py's lists, as SQL.
_FACTIONS = "('alliance', 'horde', 'neutral')"
_OLD_SOURCES = "('tsm')"


def upgrade() -> None:
    op.execute("DELETE FROM wow_item_price")
    op.execute("DELETE FROM wow_price_feed")

    op.drop_constraint("uq_wowpricefeed_key", "wow_price_feed", type_="unique")
    op.drop_constraint("ck_wowpricefeed_source", "wow_price_feed", type_="check")
    for column in ("source", "ruleset", "etag", "last_modified"):
        op.drop_column("wow_price_feed", column)
    op.add_column("wow_price_feed", sa.Column("house_id", sa.Integer(), nullable=False))
    op.add_column("wow_price_feed", sa.Column("faction", sa.String(length=10), nullable=False))
    op.create_check_constraint("ck_wowpricefeed_house_id", "wow_price_feed", "house_id > 0")
    op.create_check_constraint("ck_wowpricefeed_faction", "wow_price_feed", f"faction IN {_FACTIONS}")
    op.create_unique_constraint("uq_wowpricefeed_key", "wow_price_feed", ["game_id", "region", "house_id"])

    for column in ("name", "historical", "avg_sale_price", "sale_rate", "sold_per_day", "source_updated_at"):
        op.drop_column("wow_item_price", column)
    op.add_column("wow_item_price", sa.Column("min_buyout", sa.BigInteger(), nullable=False))
    op.add_column("wow_item_price", sa.Column("quantity", sa.BigInteger(), nullable=False))
    op.add_column("wow_item_price", sa.Column("listing_count", sa.Integer(), nullable=False))
    op.create_check_constraint(
        "ck_wowitemprice_min_buyout", "wow_item_price", "min_buyout >= 0 AND min_buyout <= market_value",
    )
    op.create_check_constraint("ck_wowitemprice_quantity", "wow_item_price", "quantity > 0")
    op.create_check_constraint("ck_wowitemprice_listing_count", "wow_item_price", "listing_count > 0")


def downgrade() -> None:
    op.execute("DELETE FROM wow_item_price")
    op.execute("DELETE FROM wow_price_feed")

    for name in ("ck_wowitemprice_listing_count", "ck_wowitemprice_quantity", "ck_wowitemprice_min_buyout"):
        op.drop_constraint(name, "wow_item_price", type_="check")
    for column in ("listing_count", "quantity", "min_buyout"):
        op.drop_column("wow_item_price", column)
    op.add_column("wow_item_price", sa.Column("name", sa.String(length=200), nullable=False))
    op.add_column("wow_item_price", sa.Column("historical", sa.BigInteger(), nullable=True))
    op.add_column("wow_item_price", sa.Column("avg_sale_price", sa.BigInteger(), nullable=True))
    op.add_column("wow_item_price", sa.Column("sale_rate", sa.Float(), nullable=True))
    op.add_column("wow_item_price", sa.Column("sold_per_day", sa.Float(), nullable=True))
    op.add_column("wow_item_price", sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=False))

    op.drop_constraint("uq_wowpricefeed_key", "wow_price_feed", type_="unique")
    op.drop_constraint("ck_wowpricefeed_faction", "wow_price_feed", type_="check")
    op.drop_constraint("ck_wowpricefeed_house_id", "wow_price_feed", type_="check")
    op.drop_column("wow_price_feed", "faction")
    op.drop_column("wow_price_feed", "house_id")
    op.add_column("wow_price_feed", sa.Column("ruleset", sa.String(length=40), nullable=True))
    op.add_column("wow_price_feed", sa.Column("source", sa.String(length=20), nullable=False))
    op.add_column("wow_price_feed", sa.Column("etag", sa.String(length=200), nullable=True))
    op.add_column("wow_price_feed", sa.Column("last_modified", sa.String(length=100), nullable=True))
    op.create_check_constraint("ck_wowpricefeed_source", "wow_price_feed", f"source IN {_OLD_SOURCES}")
    op.create_unique_constraint(
        "uq_wowpricefeed_key", "wow_price_feed", ["game_id", "region", "ruleset", "source"],
        postgresql_nulls_not_distinct=True,
    )
