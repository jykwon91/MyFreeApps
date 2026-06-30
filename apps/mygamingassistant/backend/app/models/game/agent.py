"""Agent model — a playable character within a game (Valorant only).

Valorant utilities are agent-specific (Sova's Recon Bolt / Shock Bolt), unlike
CS2's game-wide grenades. ``agent`` is the grouping dimension: each Valorant
``utility_type`` hangs off an agent via ``utility_type.agent_id``; CS2 utility
types have ``agent_id = NULL`` (no agents).

``role`` is the Valorant class (Duelist / Initiator / Controller / Sentinel) —
String(20), nullable so non-Valorant games (which seed no agents) never need it.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Agent(Base):
    __tablename__ = "agent"
    __table_args__ = (
        UniqueConstraint("game_id", "slug", name="uq_agent_game_slug"),
        Index("ix_agent_game_id", "game_id"),
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
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    game: Mapped["Game"] = relationship("Game", back_populates="agents")
    utility_types: Mapped[list["UtilityType"]] = relationship(
        "UtilityType",
        foreign_keys="[UtilityType.agent_id]",
        back_populates="agent",
        lazy="select",
    )


from app.models.game.game import Game  # noqa: E402, F401
from app.models.game.utility_type import UtilityType  # noqa: E402, F401
