"""WowItemPrice — one item's auction-house price in one price feed.

Written only by the scheduled price refresh (``app/services/wow/prices/``); read
by the public ``GET /api/wow/prices``. Public game data, so no user FK.

A price belongs to a ``WowPriceFeed`` — one (game, region, ruleset, source) —
so the full key is (game, region, ruleset, source, item) with each part stored
once. ``ON DELETE CASCADE``: a feed's prices mean nothing without the feed.

Prices are copper (1g = 100s = 10 000c). ``historical`` / ``avg_sale_price``
/ ``sale_rate`` / ``sold_per_day`` are NULL when the source has none — TSM
writes 0 for "no sales seen", which is not a price of 0.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
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
    # The item name as the source spells it — only for matching items the
    # frontend knows by name (the gold page's cloth and leather).
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    market_value: Mapped[int] = mapped_column(BigInteger, nullable=False)
    historical: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    avg_sale_price: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    sale_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sold_per_day: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # When the source computed this price (TSM's ``updatedAt``) — what "updated
    # 3 hours ago" means. ``fetched_at`` is the download that wrote this row.
    source_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
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
