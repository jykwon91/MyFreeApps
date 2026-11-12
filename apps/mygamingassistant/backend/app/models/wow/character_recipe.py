"""WowCharacterRecipe — a recipe a stored character knows.

Replaced as a set whenever Blizzard sends the character's professions; left
as it was when the professions call failed.
"""
import uuid

from sqlalchemy import ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowCharacterRecipe(Base):
    __tablename__ = "wow_character_recipe"
    __table_args__ = (Index("ix_wowcharacterrecipe_recipe_id", "recipe_id"),)

    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wow_character.id", ondelete="CASCADE"), primary_key=True,
    )
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("wow_recipe.id", ondelete="CASCADE"), primary_key=True,
    )
