"""UtilityType model — a throwable or ability type within a game.

CS2:      smoke, flash, molly, he, decoy
Valorant: smoke, flash, molly, wall (generic; agent-specific abilities in later phases)
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UtilityType(Base):
    __tablename__ = "utility_type"
    __table_args__ = (
        UniqueConstraint("game_id", "slug", name="uq_utilitytype_game_slug"),
        Index("ix_utilitytype_game_id", "game_id"),
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    game: Mapped["Game"] = relationship("Game", back_populates="utility_types")
    lineups: Mapped[list["Lineup"]] = relationship(
        "Lineup",
        foreign_keys="[Lineup.utility_type_id]",
        back_populates="utility_type",
        lazy="select",
    )


from app.models.game.game import Game  # noqa: E402, F401
from app.models.game.lineup import Lineup  # noqa: E402, F401
