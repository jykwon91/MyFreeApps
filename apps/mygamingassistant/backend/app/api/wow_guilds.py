"""WoW Forever guild page — PUBLIC, both serve-only and full-auth mode.

GET /wow/guilds/{slug} — a stored guild and its members (level, class, item
level, rank, leaderboard numbers).
GET /wow/guilds/{slug}/recipes?q= — the guild's known recipes whose name
contains ``q``, each with the members who know it.

Read from the database only: a guild is stored when someone looks up one of
its members on "Your character", and the scheduled roster refresh fills in the
rest.

Errors:
  - 404 — no stored guild by that slug (``guild_not_found``); a gone guild's
    recipe search finds nothing
  - 422 — a recipe query shorter or longer than allowed, or holding control
    characters (Postgres refuses NUL)
  - 429 — too many look-ups from this IP
"""
from fastapi import APIRouter, HTTPException, Query, Request, status

from platform_shared.core.request_utils import get_client_ip

from app.core.rate_limit import RateLimiter, check_with_retry_after
from app.core.wow_guild import (
    GUILD_RATE_LIMIT,
    GUILD_RATE_WINDOW_SECONDS,
    GUILD_RECIPE_QUERY_FORBIDDEN,
    GUILD_RECIPE_QUERY_MAX_LENGTH,
    GUILD_RECIPE_QUERY_MIN_LENGTH,
    GUILD_SLUG_MAX_LENGTH,
    GUILD_SLUG_PATTERN,
)
from app.schemas.wow.guild.guild_recipe_search_response import GuildRecipeSearchResponse
from app.schemas.wow.guild.guild_response import GuildResponse
from app.services.wow.guild import guild_recipe_search_service, guild_view_service

router = APIRouter(prefix="/wow/guilds", tags=["wow"])

guild_limiter = RateLimiter(max_attempts=GUILD_RATE_LIMIT, window_seconds=GUILD_RATE_WINDOW_SECONDS)

GUILD_NOT_FOUND = "guild_not_found"
RECIPE_QUERY_TOO_SHORT = "recipe_query_too_short"
RECIPE_QUERY_INVALID = "recipe_query_invalid"


def _checked_slug(slug: str, request: Request) -> str:
    """The per-IP limit, then the slug lowercased; an impossible slug is a 404."""
    check_with_retry_after(guild_limiter, f"wow-guild:{get_client_ip(request)}")
    slug = slug.lower()
    if len(slug) > GUILD_SLUG_MAX_LENGTH or not GUILD_SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=GUILD_NOT_FOUND)
    return slug


@router.get("/{slug}", response_model=GuildResponse)
async def get_guild(slug: str, request: Request) -> GuildResponse:
    guild = await guild_view_service.get_guild(_checked_slug(slug, request))
    if guild is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=GUILD_NOT_FOUND)
    return guild


@router.get("/{slug}/recipes", response_model=GuildRecipeSearchResponse)
async def search_guild_recipes(
    slug: str,
    request: Request,
    q: str = Query(min_length=GUILD_RECIPE_QUERY_MIN_LENGTH, max_length=GUILD_RECIPE_QUERY_MAX_LENGTH),
) -> GuildRecipeSearchResponse:
    checked = _checked_slug(slug, request)
    query = q.strip()
    if len(query) < GUILD_RECIPE_QUERY_MIN_LENGTH:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=RECIPE_QUERY_TOO_SHORT)
    if GUILD_RECIPE_QUERY_FORBIDDEN.search(query):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=RECIPE_QUERY_INVALID)
    result = await guild_recipe_search_service.search(checked, query)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=GUILD_NOT_FOUND)
    return result
