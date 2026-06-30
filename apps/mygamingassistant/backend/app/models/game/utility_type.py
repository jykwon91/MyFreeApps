"""UtilityType model — a throwable or ability type within a game.

CS2:      smoke, flash, molly, he (game-wide; ``agent_id`` is NULL)
Valorant: agent-specific abilities (Sova's recon / shock, ...) — each hangs off an
          ``agent`` via ``agent_id``. Ability slugs are globally unique within a
          game, so the (game_id, slug) unique constraint is kept and the pack /
          importer continue to resolve utility types by slug alone.
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
        Index("ix_utilitytype_agent_id", "agent_id"),
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
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent.id", ondelete="SET NULL"),
        nullable=True,
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
    agent: Mapped["Agent | None"] = relationship(
        "Agent",
        foreign_keys="[UtilityType.agent_id]",
        back_populates="utility_types",
    )
    lineups: Mapped[list["Lineup"]] = relationship(
        "Lineup",
        foreign_keys="[Lineup.utility_type_id]",
        back_populates="utility_type",
        lazy="select",
    )


from app.models.game.game import Game  # noqa: E402, F401
from app.models.game.agent import Agent  # noqa: E402, F401
from app.models.game.lineup import Lineup  # noqa: E402, F401
