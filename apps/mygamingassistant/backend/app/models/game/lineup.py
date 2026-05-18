"""Lineup model — a single utility throw with screenshots and metadata.

status values (String + CheckConstraint, never SQLAlchemy Enum):
  pending_review  — ingested but not yet accepted by the operator
  accepted        — appears in the public library
  hidden          — soft-deleted (can be un-hidden)

side values:
  side_a  — e.g. T side in CS2, Attacker in Valorant
  side_b  — e.g. CT side in CS2, Defender in Valorant
  any     — side-agnostic (e.g. a grenade thrown from spawn that works both ways)

Classification FK columns (target_zone_id, stand_zone_id, utility_type_id, side)
are nullable because auto-ingested lineups arrive in pending_review status before
classification. The CHECK constraint ck_lineup_accepted_classified enforces that
accepted lineups always have all four fields set.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

_LINEUP_STATUSES = ("pending_review", "accepted", "hidden")
_LINEUP_SIDES = ("side_a", "side_b", "any")


class Lineup(Base):
    __tablename__ = "lineup"
    __table_args__ = (
        CheckConstraint(
            f"status IN {_LINEUP_STATUSES!r}",
            name="ck_lineup_status",
        ),
        CheckConstraint(
            # NULL side is allowed for pending_review/hidden only.
            f"side IS NULL OR side IN {_LINEUP_SIDES!r}",
            name="ck_lineup_side",
        ),
        CheckConstraint(
            # Accepted lineups must have all classification fields set,
            # including game_id and map_id (nullable during pending_review
            # while the classifier is still working).
            "status != 'accepted' OR ("
            "game_id IS NOT NULL AND "
            "map_id IS NOT NULL AND "
            "target_zone_id IS NOT NULL AND "
            "stand_zone_id IS NOT NULL AND "
            "utility_type_id IS NOT NULL AND "
            "side IS NOT NULL"
            ")",
            name="ck_lineup_accepted_classified",
        ),
        Index("ix_lineup_game_id", "game_id"),
        Index("ix_lineup_map_id", "map_id"),
        Index("ix_lineup_target_zone_id", "target_zone_id"),
        Index("ix_lineup_status", "status"),
        Index("ix_lineup_youtube_video_id", "youtube_video_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    game_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.id", ondelete="CASCADE"),
        nullable=True,
    )
    map_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map.id", ondelete="CASCADE"),
        nullable=True,
    )
    target_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map_zone.id", ondelete="RESTRICT"),
        nullable=True,
    )
    stand_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map_zone.id", ondelete="RESTRICT"),
        nullable=True,
    )
    side: Mapped[str | None] = mapped_column(String(10), nullable=True)
    utility_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utility_type.id", ondelete="RESTRICT"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Screenshot URLs in MinIO (presigned at read time)
    stand_screenshot_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    aim_screenshot_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    clip_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Normalized 0-1 crosshair position on the aim screenshot
    aim_anchor_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    aim_anchor_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Normalized 0-1 minimap positions. NULL falls back to zone centroid at
    # read time so existing lineups render without backfill (PR 1/3 in the
    # lineup-pins series).
    stand_anchor_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    stand_anchor_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_anchor_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_anchor_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    # How many seconds the throw takes to execute
    setup_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # YouTube ingestion metadata
    youtube_video_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chapter_start_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chapter_title: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Classifier suggestions (PR 5) — written by classify_lineup(); user accepts
    # or overrides in the review queue. Distinct from the "accepted" FK columns
    # so the user can see side-by-side what was suggested vs what they chose.
    suggested_game_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.id", ondelete="SET NULL"),
        nullable=True,
    )
    suggested_map_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map.id", ondelete="SET NULL"),
        nullable=True,
    )
    suggested_target_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map_zone.id", ondelete="SET NULL"),
        nullable=True,
    )
    suggested_stand_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map_zone.id", ondelete="SET NULL"),
        nullable=True,
    )
    suggested_side: Mapped[str | None] = mapped_column(String(10), nullable=True)
    suggested_utility_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utility_type.id", ondelete="SET NULL"),
        nullable=True,
    )
    classification_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    classification_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Attribution
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source.id", ondelete="SET NULL"),
        nullable=True,
    )
    attribution_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attribution_author: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending_review", server_default="pending_review"
    )

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

    # Relationships — explicit foreign_keys required because suggested_* columns
    # create multiple FK paths between lineup and game/map/map_zone/utility_type.
    game: Mapped["Game"] = relationship(
        "Game", foreign_keys=[game_id], back_populates="lineups"
    )
    map: Mapped["Map"] = relationship(
        "Map", foreign_keys=[map_id], back_populates="lineups"
    )
    target_zone: Mapped["MapZone | None"] = relationship(
        "MapZone", foreign_keys=[target_zone_id], back_populates="lineups_as_target"
    )
    stand_zone: Mapped["MapZone | None"] = relationship(
        "MapZone", foreign_keys=[stand_zone_id], back_populates="lineups_as_stand"
    )
    utility_type: Mapped["UtilityType | None"] = relationship(
        "UtilityType", foreign_keys=[utility_type_id], back_populates="lineups"
    )
    source: Mapped["Source | None"] = relationship("Source", back_populates="lineups")


from app.models.game.game import Game  # noqa: E402, F401
from app.models.game.map import Map  # noqa: E402, F401
from app.models.game.map_zone import MapZone  # noqa: E402, F401
from app.models.game.utility_type import UtilityType  # noqa: E402, F401
from app.models.game.source import Source  # noqa: E402, F401
