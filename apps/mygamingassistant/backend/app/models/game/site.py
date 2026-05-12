"""Site model — a logical bomb/objective site on a map.

Sites are a logical grouping (A site, B site, Mid) that can span multiple
MapZone polygons. For example, "A site" might include the zones:
  a_main, a_short, a_long, a_platform, a_site_box

Phase 2+ will use sites to group the lineup filter panel.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Site(Base):
    __tablename__ = "site"
    __table_args__ = (
        UniqueConstraint("map_id", "slug", name="uq_site_map_slug"),
        Index("ix_site_map_id", "map_id"),
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
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    map: Mapped["Map"] = relationship("Map", back_populates="sites")


from app.models.game.map import Map  # noqa: E402, F401
