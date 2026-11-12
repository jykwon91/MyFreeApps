"""WowRecipe — a recipe some stored character knows, by Blizzard's id, with its name.

Filled from the characters' professions as they are stored, so a recipe
search can match names without asking Blizzard. One row per recipe however
many characters know it (``wow_character_recipe``).
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_character import RECIPE_NAME_MAX_LENGTH
from app.db.base import Base


class WowRecipe(Base):
    __tablename__ = "wow_recipe"
    __table_args__ = (Index("ix_wowrecipe_profession_id", "profession_id"),)

    # Blizzard's recipe id: the client's SkillLineAbility row, not the spell id
    # (the frontend's ``recipeSpells.json`` maps it to the spell).
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    # Blizzard's profession id (SkillLine id).
    profession_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(RECIPE_NAME_MAX_LENGTH), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
