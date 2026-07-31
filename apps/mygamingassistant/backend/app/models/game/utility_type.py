"""UtilityType model — a throwable or ability type within a game.

CS2:      smoke, flash, molly, he (game-wide; ``agent_id`` is NULL)
Valorant: agent-specific abilities (Sova's recon / shock, ...) — each hangs off an
          ``agent`` via ``agent_id``. Ability slugs are globally unique within a
          game, so the (game_id, slug) unique constraint is kept and the pack /
          importer continue to resolve utility types by slug alone.

PLACEMENT is what decides how many beats a lineup has. A THROWN utility travels, so
it storyboards as STAND -> AIM -> THROW -> LANDING. A PLACED one (Cypher's trapwire
and spycam, Killjoy's turret/alarmbot) is mounted on a surface the player is standing
at: there is a stand, there is an aim (the surface and angle being mounted are the
whole lesson), and there is a landing (the deployed device), but there is no throw
because nothing is ever in flight. Treating that as a degraded 4-beat lineup with a
missing throw is wrong — it is a complete 3-beat lineup, and the distinction has to
live on the utility type because it is a property of the ability, not of any one clip.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UtilityType(Base):
    __tablename__ = "utility_type"
    __table_args__ = (
        UniqueConstraint("game_id", "slug", name="uq_utilitytype_game_slug"),
        Index("ix_utilitytype_game_id", "game_id"),
        Index("ix_utilitytype_agent_id", "agent_id"),
        # String + CheckConstraint rather than a SQLAlchemy/PG Enum, per the schema
        # convention: adding a value later is an ALTER of this constraint, not an
        # ALTER TYPE that has to be coordinated across every app on the cluster.
        CheckConstraint(
            "placement IN ('thrown', 'placed')",
            name="ck_utilitytype_placement",
        ),
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
    # 'thrown' is the safe default: every utility type that existed before this
    # column travels through the air, so a backfill of the existing rows to
    # 'thrown' is correct rather than merely convenient.
    placement: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="thrown",
        server_default="thrown",
    )
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
