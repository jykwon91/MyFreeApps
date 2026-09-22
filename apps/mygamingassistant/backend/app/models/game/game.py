"""Game model — top-level entity (CS2, Valorant, WoW Forever, etc.).

``kind`` says which feature family a game uses:
  lineups:   map/lineup library (CS2, Valorant) — maps, zones, utilities, sides
  companion: static guides + tools with no maps (WoW Forever). The frontend
             game registry (src/games/registry.ts) owns the feature pages.

side_a_label / side_b_label carry game-specific terminology for lineup games:
  CS2:      side_a='T',        side_b='CT'
  Valorant: side_a='Attacker', side_b='Defender'
They are NULL for companion games; ``ck_game_lineup_side_labels`` requires
both on every lineup game.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Game(Base):
    __tablename__ = "game"
    __table_args__ = (
        CheckConstraint("kind IN ('lineups', 'companion')", name="ck_game_kind"),
        CheckConstraint(
            "kind <> 'lineups' OR "
            "(side_a_label IS NOT NULL AND side_b_label IS NOT NULL)",
            name="ck_game_lineup_side_labels",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default="lineups", server_default="lineups"
    )
    side_a_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    side_b_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
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
    agents: Mapped[list["Agent"]] = relationship(
        "Agent", back_populates="game", lazy="select"
    )
    lineups: Mapped[list["Lineup"]] = relationship(
        "Lineup",
        foreign_keys="[Lineup.game_id]",
        back_populates="game",
        lazy="select",
    )


# Avoid circular import at module level by importing here
from app.models.game.map import Map  # noqa: E402, F401
from app.models.game.utility_type import UtilityType  # noqa: E402, F401
from app.models.game.agent import Agent  # noqa: E402, F401
from app.models.game.lineup import Lineup  # noqa: E402, F401
