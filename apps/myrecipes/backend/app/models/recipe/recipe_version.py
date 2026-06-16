"""Recipe version -- an immutable content snapshot created by each tweak.

Linear history: ``version_number`` increments 1, 2, 3... per recipe. Each
version fully snapshots its ingredients + steps (see ``recipe_ingredient`` /
``recipe_step``), so any version can be viewed, diffed, or restored without
replaying deltas -- recipes are tiny, so the duplication is free.

``parent_version_id`` records lineage (what this was tweaked from). It is a
plain UUID, NOT a DB foreign key: versions are append-only and only ever
created by the service copying a parent forward, so app logic -- not a
constraint -- guarantees integrity, and a self-referential FK would only
complicate the recipe-delete cascade.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecipeVersion(Base):
    __tablename__ = "recipe_version"
    __table_args__ = (
        UniqueConstraint("recipe_id", "version_number", name="uq_recipe_version_number"),
        Index("ix_recipe_version_recipe_id", "recipe_id"),
        Index("ix_recipe_version_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recipe.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalized tenant key: lets every version query filter by user_id
    # directly and gives the user-delete cascade a direct path to versions.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True,
    )
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prep_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cook_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
