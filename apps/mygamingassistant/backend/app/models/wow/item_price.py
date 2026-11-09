"""WowItemPrice — one item's auction-house figures for one faction's price feed.

Written only by the scheduled price refresh (``app/services/wow/prices/``); read
by the public ``GET /api/wow/prices``. Public game data, so no user FK.

A price belongs to a ``WowPriceFeed`` — one (game, region, faction) — so the
full key is (game, region, faction, item) with each part stored once.
``ON DELETE CASCADE``: a feed's prices mean nothing without the feed.

Only aggregates of the listings are kept, never the listings themselves.
Prices are copper per unit (1g = 100s = 10 000c). Names aren't stored:
Blizzard's auction data has none, so the API names items from the Forever
client (``client_item_names``).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowItemPrice(Base):
    __tablename__ = "wow_item_price"
    __table_args__ = (
        CheckConstraint("item_id > 0", name="ck_wowitemprice_item_id"),
        CheckConstraint("market_value >= 0", name="ck_wowitemprice_market_value"),
        CheckConstraint("min_buyout >= 0 AND min_buyout <= market_value", name="ck_wowitemprice_min_buyout"),
        CheckConstraint("quantity > 0", name="ck_wowitemprice_quantity"),
        CheckConstraint("listing_count > 0", name="ck_wowitemprice_listing_count"),
        # Its index serves every read: all prices of one feed.
        UniqueConstraint("feed_id", "item_id", name="uq_wowitemprice_feed_item"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    feed_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wow_price_feed.id", ondelete="CASCADE"), nullable=False,
    )
    item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # The price every page shows: a low quantile of the listed units
    # (MARKET_VALUE_QUANTILE), so one troll listing can't move it.
    market_value: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # The cheapest unit listed.
    min_buyout: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Units listed, over every listing.
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    listing_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # The download that wrote this row.
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
