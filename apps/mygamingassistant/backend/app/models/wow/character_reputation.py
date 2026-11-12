"""WowCharacterReputation — a character's standing with one faction in one daily metric row.

Replaced as a set whenever Blizzard sends the reputations; left as it was when
the reputations call failed. A faction the character hasn't met has no row.
Rows go with their daily metric row (retention purge).
"""
import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, SmallInteger, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowCharacterReputation(Base):
    __tablename__ = "wow_character_reputation"
    __table_args__ = (
        # One standing per faction per day; leads with the metric row for its reads and the cascade.
        UniqueConstraint("daily_metric_id", "faction_id", name="uq_wowcharacterreputation_metric_faction"),
        CheckConstraint("tier BETWEEN 0 AND 7", name="ck_wowcharacterreputation_tier"),
        CheckConstraint("value >= 0 AND max >= 0", name="ck_wowcharacterreputation_progress"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    daily_metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wow_character_daily_metric.id", ondelete="CASCADE"), nullable=False,
    )
    # Factions are never deleted; RESTRICT keeps a lookup cleanup from wiping standings.
    faction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("wow_faction.id", ondelete="RESTRICT"), nullable=False,
    )
    # 0 = Hated … 7 = Exalted.
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Progress within the tier, out of ``max``.
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    max: Mapped[int] = mapped_column(Integer, nullable=False)
