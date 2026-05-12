"""Map model — a playable map within a game.

minimap_calibration_json stores per-map pixel calibration data used by
the live detection pipeline (PR 9). Shape:
  {
    "top_left": {"px_x": int, "px_y": int},
    "bottom_right": {"px_x": int, "px_y": int},
    "resolution": "1920x1080"
  }
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Map(Base):
    __tablename__ = "map"
    __table_args__ = (
        UniqueConstraint("game_id", "slug", name="uq_map_game_slug"),
        Index("ix_map_game_id", "game_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.id", ondelete="CASCADE"),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    minimap_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    minimap_calibration_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    game: Mapped["Game"] = relationship("Game", back_populates="maps")
    zones: Mapped[list["MapZone"]] = relationship("MapZone", back_populates="map", lazy="select")
    sites: Mapped[list["Site"]] = relationship("Site", back_populates="map", lazy="select")
    lineups: Mapped[list["Lineup"]] = relationship(
        "Lineup",
        foreign_keys="[Lineup.map_id]",
        back_populates="map",
        lazy="select",
    )


from app.models.game.game import Game  # noqa: E402, F401
from app.models.game.map_zone import MapZone  # noqa: E402, F401
from app.models.game.site import Site  # noqa: E402, F401
from app.models.game.lineup import Lineup  # noqa: E402, F401
