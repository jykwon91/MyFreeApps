"""Game model — top-level entity (CS2, Valorant, etc.).

side_a_label / side_b_label carry game-specific terminology:
  CS2:      side_a='T',        side_b='CT'
  Valorant: side_a='Attacker', side_b='Defender'
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Game(Base):
    __tablename__ = "game"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    side_a_label: Mapped[str] = mapped_column(String(50), nullable=False)
    side_b_label: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    maps: Mapped[list["Map"]] = relationship("Map", back_populates="game", lazy="select")
    utility_types: Mapped[list["UtilityType"]] = relationship(
        "UtilityType", back_populates="game", lazy="select"
    )
    lineups: Mapped[list["Lineup"]] = relationship("Lineup", back_populates="game", lazy="select")


# Avoid circular import at module level by importing here
from app.models.game.map import Map  # noqa: E402, F401
from app.models.game.utility_type import UtilityType  # noqa: E402, F401
from app.models.game.lineup import Lineup  # noqa: E402, F401
