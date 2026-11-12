"""A live guild member who knows a recipe, as ``recipe_repo.guild_crafters`` reads it."""
from __future__ import annotations

from typing import NamedTuple


class GuildCrafterRow(NamedTuple):
    recipe_id: int
    slug: str
    name: str
    surname: str
    class_id: int
