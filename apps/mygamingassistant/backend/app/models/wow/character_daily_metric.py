"""WowCharacterDailyMetric — one character's leaderboard numbers on one UTC day.

Upserted on every fetch of the character that day, so the last fetch of the
day is the day's value. NULL means Blizzard didn't send that number (a failed
call keeps the day's earlier value), never 0. A day nobody looked the
character up has no row; readers take the newest row at or before a day.
Profession skills hang off the row (``wow_character_profession_skill``); a day
whose fetches all failed on professions has none, so a reader wanting skills
takes the newest row that has them.
Rows older than ``CHARACTER_METRIC_RETENTION`` are purged, except each
character's newest.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, SmallInteger, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowCharacterDailyMetric(Base):
    __tablename__ = "wow_character_daily_metric"
    __table_args__ = (
        # The upsert key, and a character's latest / history reads.
        UniqueConstraint("character_id", "day", name="uq_wowcharacterdailymetric_character_day"),
        # The retention purge.
        Index("ix_wowcharacterdailymetric_day", "day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wow_character.id", ondelete="CASCADE"), nullable=False,
    )
    day: Mapped[date] = mapped_column(Date, nullable=False)
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    item_level: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    honorable_kills: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    killing_blows: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deaths_from_players: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_kills: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_deaths: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Tracked dungeons with a final-boss kill.
    dungeons_done: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    exalted_reputations: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
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
