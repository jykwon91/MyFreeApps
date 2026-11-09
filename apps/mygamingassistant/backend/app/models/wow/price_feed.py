"""WowPriceFeed — the refresh state of one auction house's price set.

One row per Blizzard auction house the scheduler pulls (the mapped houses in
``PRICE_SERVER_HOUSES``). Each house is its own server market, so the key is
(game, region, house_id); ``faction`` is the faction Blizzard's index names
the house for. Which server a house belongs to is NOT stored — it lives only
in the mapping, so mapping another server needs no migration. It
carries when Blizzard took the snapshot the stored prices come from, when we
last downloaded them, and the last failure — so a feed that keeps failing is
visible in the DB and the API never presents old prices as fresh.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_prices import PRICE_FACTIONS, PRICE_REGIONS
from app.db.base import Base
from app.db.sql_in_list import sql_in_list


class WowPriceFeed(Base):
    __tablename__ = "wow_price_feed"
    __table_args__ = (
        CheckConstraint(f"region IN {sql_in_list(PRICE_REGIONS)}", name="ck_wowpricefeed_region"),
        CheckConstraint(f"faction IN {sql_in_list(PRICE_FACTIONS)}", name="ck_wowpricefeed_faction"),
        CheckConstraint("item_count >= 0", name="ck_wowpricefeed_item_count"),
        CheckConstraint("house_id > 0", name="ck_wowpricefeed_house_id"),
        # Its index serves every read: one house's feed.
        UniqueConstraint("game_id", "region", "house_id", name="uq_wowpricefeed_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("game.id", ondelete="CASCADE"), nullable=False,
    )
    region: Mapped[str] = mapped_column(String(4), nullable=False)
    # Blizzard's auction-house id (110, 113, ...) — the house alone is the market.
    house_id: Mapped[int] = mapped_column(Integer, nullable=False)
    faction: Mapped[str] = mapped_column(String(10), nullable=False)
    # When Blizzard took the snapshot behind the stored prices (the newest
    # house's Last-Modified). NULL until a download carried any prices.
    source_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last download that replaced the stored prices.
    fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last time we asked at all, whatever the answer.
    checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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
