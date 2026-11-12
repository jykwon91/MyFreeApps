"""A recipe a live guild member knows, as ``recipe_repo.guild_recipes_matching`` reads it."""
from __future__ import annotations

from typing import NamedTuple


class GuildRecipeRow(NamedTuple):
    id: int
    name: str
    profession_id: int
