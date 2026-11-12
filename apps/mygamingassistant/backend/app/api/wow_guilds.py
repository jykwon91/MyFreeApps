"""WoW Forever guild page — PUBLIC, both serve-only and full-auth mode.

GET /wow/guilds/{slug} — a stored guild and its members (level, class, item
level, rank). Read from the database only: a guild is stored when someone
looks up one of its members on "Your character", and the scheduled roster
refresh fills in the rest.

Errors:
  - 404 — no stored guild by that slug (``guild_not_found``)
  - 429 — too many look-ups from this IP
"""
from fastapi import APIRouter, HTTPException, Request, status

from platform_shared.core.request_utils import get_client_ip

from app.core.rate_limit import RateLimiter, check_with_retry_after
from app.core.wow_guild import GUILD_RATE_LIMIT, GUILD_RATE_WINDOW_SECONDS, GUILD_SLUG_MAX_LENGTH, GUILD_SLUG_PATTERN
from app.schemas.wow.guild.guild_response import GuildResponse
from app.services.wow.guild import guild_view_service

router = APIRouter(prefix="/wow/guilds", tags=["wow"])

guild_limiter = RateLimiter(max_attempts=GUILD_RATE_LIMIT, window_seconds=GUILD_RATE_WINDOW_SECONDS)

GUILD_NOT_FOUND = "guild_not_found"


@router.get("/{slug}", response_model=GuildResponse)
async def get_guild(slug: str, request: Request) -> GuildResponse:
    check_with_retry_after(guild_limiter, f"wow-guild:{get_client_ip(request)}")
    slug = slug.lower()
    if len(slug) > GUILD_SLUG_MAX_LENGTH or not GUILD_SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=GUILD_NOT_FOUND)
    guild = await guild_view_service.get_guild(slug)
    if guild is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=GUILD_NOT_FOUND)
    return guild
