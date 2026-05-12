"""MapZone model — a clickable polygon region on a map's minimap.

polygon_points: list of {"x": float, "y": float} normalized 0-1 coords
relative to the minimap image dimensions. Used by the plan-mode UI
to render clickable overlay polygons and by the live detection pipeline
to map player pixel coordinates to named zones.

Example for a rectangular zone:
  [{"x": 0.2, "y": 0.1}, {"x": 0.4, "y": 0.1},
   {"x": 0.4, "y": 0.3}, {"x": 0.2, "y": 0.3}]
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MapZone(Base):
    __tablename__ = "map_zone"
    __table_args__ = (
        UniqueConstraint("map_id", "slug", name="uq_mapzone_map_slug"),
        Index("ix_mapzone_map_id", "map_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map.id", ondelete="CASCADE"),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # polygon_points: list of {"x": float, "y": float} normalized 0-1
    polygon_points: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    map: Mapped["Map"] = relationship("Map", back_populates="zones")
    lineups_as_target: Mapped[list["Lineup"]] = relationship(
        "Lineup",
        foreign_keys="[Lineup.target_zone_id]",
        back_populates="target_zone",
        lazy="select",
    )
    lineups_as_stand: Mapped[list["Lineup"]] = relationship(
        "Lineup",
        foreign_keys="[Lineup.stand_zone_id]",
        back_populates="stand_zone",
        lazy="select",
    )


from app.models.game.map import Map  # noqa: E402, F401
from app.models.game.lineup import Lineup  # noqa: E402, F401
