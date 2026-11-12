"""Matched recipes, their crafters and the guild's skills → ``GuildRecipeSearchResponse``."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from app.core.wow_character import CLASS_NAMES_BY_ID
from app.repositories.wow.guild_crafter_row import GuildCrafterRow
from app.repositories.wow.guild_member_skill_row import GuildMemberSkillRow
from app.repositories.wow.guild_recipe_row import GuildRecipeRow
from app.schemas.wow.guild.guild_crafter_response import GuildCrafterResponse
from app.schemas.wow.guild.guild_recipe_response import GuildRecipeResponse
from app.schemas.wow.guild.guild_recipe_search_response import GuildRecipeSearchResponse


def to_recipe_search_response(
    query: str,
    recipes: Sequence[GuildRecipeRow],
    crafters: Sequence[GuildCrafterRow],
    skills: Sequence[GuildMemberSkillRow],
    *,
    truncated: bool,
) -> GuildRecipeSearchResponse:
    skill_by_member = {(s.slug, s.profession_id): s for s in skills}
    crafters_by_recipe: defaultdict[int, list[GuildCrafterRow]] = defaultdict(list)
    for crafter in crafters:
        crafters_by_recipe[crafter.recipe_id].append(crafter)

    def crafter_response(crafter: GuildCrafterRow, profession_id: int) -> GuildCrafterResponse:
        skill = skill_by_member.get((crafter.slug, profession_id))
        return GuildCrafterResponse(
            slug=crafter.slug,
            name=crafter.name,
            surname=crafter.surname,
            class_name=CLASS_NAMES_BY_ID.get(crafter.class_id),
            skill=None if skill is None else skill.skill,
            max_skill=None if skill is None else skill.max_skill,
        )

    def recipe_response(recipe: GuildRecipeRow) -> GuildRecipeResponse:
        rows = [crafter_response(c, recipe.profession_id) for c in crafters_by_recipe[recipe.id]]
        rows.sort(key=lambda c: (-(c.skill or 0), c.name.lower(), c.surname.lower()))
        return GuildRecipeResponse(id=recipe.id, name=recipe.name, profession_id=recipe.profession_id, crafters=rows)

    return GuildRecipeSearchResponse(query=query, recipes=[recipe_response(r) for r in recipes], truncated=truncated)
