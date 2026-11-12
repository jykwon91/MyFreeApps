"""Who in a guild knows a recipe: a name search over the recipes its stored members know.

Stored data only, never calls Blizzard. Members' recipes are stored with their
characters (``character_store_service``) and refreshed with the roster.
"""
from __future__ import annotations

from app.core.wow_guild import GUILD_RECIPE_EXCLUDED_PROFESSION_IDS, GUILD_RECIPE_RESULT_LIMIT
from app.db.session import unit_of_work
from app.repositories.wow import guild_repo, recipe_repo
from app.schemas.wow.guild.guild_recipe_search_response import GuildRecipeSearchResponse
from app.services.wow.guild.guild_recipe_mapper import to_recipe_search_response


async def search(slug: str, query: str) -> GuildRecipeSearchResponse | None:
    """The guild's known recipes whose name contains ``query``; None if the slug was never stored."""
    async with unit_of_work() as db:
        guild = await guild_repo.get_by_slug(db, slug)
        if guild is None:
            return None
        # A gone guild's members are guildless already; nobody knows anything.
        if guild.gone_at is not None:
            return to_recipe_search_response(query, [], [], [], truncated=False)
        recipes = await recipe_repo.guild_recipes_matching(
            db, guild.id, query,
            excluded_profession_ids=GUILD_RECIPE_EXCLUDED_PROFESSION_IDS, limit=GUILD_RECIPE_RESULT_LIMIT + 1,
        )
        truncated = len(recipes) > GUILD_RECIPE_RESULT_LIMIT
        recipes = recipes[:GUILD_RECIPE_RESULT_LIMIT]
        crafters = await recipe_repo.guild_crafters(db, guild.id, [r.id for r in recipes])
        slugs = sorted({c.slug for c in crafters})
        skills = await guild_repo.member_skills(db, guild.id, slugs=slugs) if slugs else []
    return to_recipe_search_response(query, recipes, crafters, skills, truncated=truncated)
