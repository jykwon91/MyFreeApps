"""WowPriceFeed — the refresh state of one (game, region, ruleset, source) price feed.

One row per feed the scheduler pulls. It carries what the next request needs
for a conditional GET (``etag`` / ``last_modified``), when the prices were
computed by the source and when we last downloaded them, and the last failure —
so a feed that keeps failing is visible in the DB and the API never presents
old prices as fresh.
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

from app.core.wow_prices import PRICE_REGIONS, PRICE_SOURCES
from app.db.base import Base
from app.db.sql_in_list import sql_in_list


class WowPriceFeed(Base):
    __tablename__ = "wow_price_feed"
    __table_args__ = (
        CheckConstraint(f"region IN {sql_in_list(PRICE_REGIONS)}", name="ck_wowpricefeed_region"),
        CheckConstraint(f"source IN {sql_in_list(PRICE_SOURCES)}", name="ck_wowpricefeed_source"),
        CheckConstraint("item_count >= 0", name="ck_wowpricefeed_item_count"),
        UniqueConstraint(
            "game_id", "region", "ruleset", "source",
            name="uq_wowpricefeed_key",
            postgresql_nulls_not_distinct=True,
        ),
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
    ruleset: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    # Validators from the last 200, sent back as If-None-Match / If-Modified-Since.
    etag: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    last_modified: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Newest per-item time the source stamped on the stored prices. NULL until
    # a download carried any prices.
    source_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last download that replaced the stored prices (a 304 doesn't move it).
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
