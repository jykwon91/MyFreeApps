"""Recipe step -- one ordered instruction belonging to a single version snapshot."""
import uuid

from sqlalchemy import ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecipeStep(Base):
    __tablename__ = "recipe_step"
    __table_args__ = (Index("ix_recipe_step_version_id", "version_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recipe_version.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
