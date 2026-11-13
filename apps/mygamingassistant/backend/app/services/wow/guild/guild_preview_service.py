"""The guild page's link-preview PNG, drawn from the stored guild (never Blizzard).

Unfurlers don't run JavaScript, so the picture Discord shows for the guild's URL is rendered here from the same
stored data the page shows. Rendering takes a moment, so the bytes are kept per guild until its roster or any
member is refreshed (the cache key), and drawing runs off the event loop.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.schemas.wow.guild.guild_response import GuildResponse
from app.services.wow.guild import guild_preview_boards, guild_preview_image, guild_view_service

logger = logging.getLogger(__name__)

CacheKey = tuple[str, datetime | None, datetime | None]
_cache: dict[str, tuple[CacheKey, bytes]] = {}
# One render at a time: requests that arrive while the card is being drawn wait for it, then hit the cache.
_render_lock = asyncio.Lock()


def cache_key(guild: GuildResponse) -> CacheKey:
    """What the picture depends on: the guild, its roster's refresh, and the newest member refresh."""
    newest = max((m.refreshed_at for m in guild.members), default=None)
    return guild.slug, guild.roster_updated_at, newest


def render_png(guild: GuildResponse) -> bytes:
    card = guild_preview_image.render_card(
        guild.name, guild.faction, guild_preview_boards.subtitle(guild), guild_preview_boards.podium_boards(guild.members),
    )
    return guild_preview_image.encode_png(card)


async def get_preview_png(slug: str) -> bytes | None:
    """The guild's card as PNG bytes; None when the guild was never stored or the card can't be drawn."""
    guild = await guild_view_service.get_guild(slug)
    if guild is None:
        return None
    key = cache_key(guild)
    async with _render_lock:
        cached = _cache.get(slug)
        if cached is not None and cached[0] == key:
            return cached[1]
        try:
            png = await asyncio.to_thread(render_png, guild)
        except Exception:
            logger.exception("Guild link-preview render failed for %s", slug)
            return None
        _cache[slug] = (key, png)
        return png
