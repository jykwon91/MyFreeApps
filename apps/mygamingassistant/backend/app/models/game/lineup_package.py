"""LineupPackage + LineupPackageLineup (join table) models.

LineupPackage is a named bundle of lineups (e.g. "Full B exec" =
a curated set of lineups that work together for a coordinated round).

LineupPackageLineup is the ordered join table connecting packages to lineups,
with sort_order to preserve the sequence the operator intended.

side values match Lineup.side: side_a | side_b | any
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

_PACKAGE_SIDES = ("side_a", "side_b", "any")


class LineupPackage(Base):
    __tablename__ = "lineup_package"
    __table_args__ = (
        CheckConstraint(
            f"side IN {_PACKAGE_SIDES!r}",
            name="ck_lineuppackage_side",
        ),
        Index("ix_lineuppackage_game_id", "game_id"),
        Index("ix_lineuppackage_map_id", "map_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.id", ondelete="CASCADE"),
        nullable=False,
    )
    map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("map.id", ondelete="CASCADE"),
        nullable=False,
    )
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    package_lineups: Mapped[list["LineupPackageLineup"]] = relationship(
        "LineupPackageLineup",
        back_populates="package",
        order_by="LineupPackageLineup.sort_order",
        lazy="select",
    )


class LineupPackageLineup(Base):
    """Ordered join table connecting LineupPackage to Lineup."""

    __tablename__ = "lineup_package_lineup"
    __table_args__ = (
        UniqueConstraint("package_id", "lineup_id", name="uq_pkglineup_pkg_lineup"),
        Index("ix_pkglineup_package_id", "package_id"),
    )

    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lineup_package.id", ondelete="CASCADE"),
        primary_key=True,
    )
    lineup_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lineup.id", ondelete="CASCADE"),
        primary_key=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    package: Mapped["LineupPackage"] = relationship(
        "LineupPackage", back_populates="package_lineups"
    )
