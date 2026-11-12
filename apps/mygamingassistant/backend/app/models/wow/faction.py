"""WowFaction — a WoW faction's name, by Blizzard's faction id.

Upserted from every stored character's reputations, so the guild reputation
board can name a faction without storing the name on each standing.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_character import FACTION_NAME_MAX_LENGTH
from app.db.base import Base


class WowFaction(Base):
    __tablename__ = "wow_faction"

    # Blizzard's faction id (the client's Faction table).
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(FACTION_NAME_MAX_LENGTH), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
