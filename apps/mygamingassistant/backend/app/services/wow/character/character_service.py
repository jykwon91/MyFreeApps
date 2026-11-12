"""Look up a WoW Forever character, with a short in-process cache.

One cached entry per character holds Blizzard's raw answers; the cropped
render is cached beside it. Both expire after ``CHARACTER_CACHE_SECONDS``, so a
player who logs out with new gear sees it within minutes, and a page that
loads the sheet and the picture asks Blizzard once.

Everything past the profile, media and equipment is an optional part
(``_OPTIONAL_PARTS``): if Blizzard fails on one, the sheet still shows (that
part null), the failure is logged, and the answer is not cached so the next
look-up asks again.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, Final, TypeVar

from app.core.config import settings
from app.core.wow_character import (
    CHARACTER_CACHE_MAX_ENTRIES,
    CHARACTER_CACHE_SECONDS,
    CHARACTER_RENDER_CACHE_MAX_ENTRIES,
)
from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character.blizzard_character_client import BlizzardCharacterClient
from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.character.character_lookup_error import CharacterLookupError
from app.services.wow.character.character_mapper import render_url, to_character_response
from app.services.wow.character.character_profile import CharacterProfile
from app.services.wow.character.character_render_crop import crop_render

T = TypeVar("T")

logger = logging.getLogger(__name__)

_Fetch = Callable[[BlizzardCharacterClient, str], Awaitable[dict[str, Any] | None]]

# CharacterProfile field → (the name logged when Blizzard fails on it, the client call).
_OPTIONAL_PARTS: Final[dict[str, tuple[str, _Fetch]]] = {
    "statistics": ("statistics", BlizzardCharacterClient.statistics),
    "specializations": ("talents", BlizzardCharacterClient.specializations),
    "professions": ("professions", BlizzardCharacterClient.professions),
    "reputations": ("reputations", BlizzardCharacterClient.reputations),
    "pvp_summary": ("PvP summary", BlizzardCharacterClient.pvp_summary),
    "achievement_statistics": ("achievement statistics", BlizzardCharacterClient.achievement_statistics),
    "mounts": ("mounts", BlizzardCharacterClient.mounts),
    "pets": ("pets", BlizzardCharacterClient.pets),
}
# Parts Blizzard 404s when the character simply has none yet (no talent spent, no
# profession learned, no faction met…): that is an empty answer, not a failure.
_EMPTY_WHEN_MISSING: Final = frozenset(_OPTIONAL_PARTS) - {"statistics"}

_tokens = BlizzardTokenCache()
_profiles: dict[str, tuple[CharacterProfile, float]] = {}
_renders: dict[str, tuple[bytes, float]] = {}


def new_client() -> BlizzardCharacterClient:
    """A Blizzard client sharing this module's token cache (``async with new_client() as client``)."""
    return BlizzardCharacterClient(settings.blizzard_client_id, settings.blizzard_client_secret, _tokens)


def _fresh(cache: dict[str, tuple[T, float]], slug: str) -> T | None:
    entry = cache.get(slug)
    if entry is None or time.monotonic() - entry[1] >= CHARACTER_CACHE_SECONDS:
        return None
    return entry[0]


def _store(cache: dict[str, tuple[T, float]], slug: str, value: T, max_entries: int) -> None:
    if len(cache) >= max_entries:
        now = time.monotonic()
        for key in [k for k, (_, at) in cache.items() if now - at >= CHARACTER_CACHE_SECONDS]:
            del cache[key]
        if len(cache) >= max_entries:
            del cache[min(cache, key=lambda k: cache[k][1])]
    cache[slug] = (value, time.monotonic())


async def _optional_part(
    client: BlizzardCharacterClient, slug: str, part: str, fetch: _Fetch,
) -> tuple[dict[str, Any] | None, bool]:
    """One optional sub-resource, and whether Blizzard answered (a failure must not blank the sheet)."""
    try:
        return await fetch(client, slug), True
    except CharacterLookupError as exc:
        logger.warning("Character %s unavailable for %s: status=%s %s", part, slug, exc.status_code, exc)
        return None, False


async def _load(slug: str) -> tuple[CharacterProfile, bool]:
    """Blizzard's answers for the character, and whether Blizzard was asked for them just now."""
    cached = _fresh(_profiles, slug)
    if cached is not None:
        return cached, False
    async with new_client() as client:
        profile = await client.profile(slug)
        media, equipment, *answers = await asyncio.gather(
            client.media(slug),
            client.equipment(slug),
            *(_optional_part(client, slug, part, fetch) for part, fetch in _OPTIONAL_PARTS.values()),
        )
    parts: dict[str, dict[str, Any] | None] = {}
    for field, (value, answered) in zip(_OPTIONAL_PARTS, answers):
        parts[field] = {} if answered and value is None and field in _EMPTY_WHEN_MISSING else value
    data = CharacterProfile(profile=profile, media=media, equipment=equipment, **parts)
    if all(answered for _, answered in answers):
        _store(_profiles, slug, data, CHARACTER_CACHE_MAX_ENTRIES)
    return data, True


async def _profile(slug: str) -> CharacterProfile:
    return (await _load(slug))[0]


async def fetch_character(slug: str) -> CharacterFetch:
    """Raises ``CharacterLookupError`` (status 404 = no character by that name)."""
    profile, fresh = await _load(slug)
    return CharacterFetch(response=to_character_response(slug, profile), profile=profile, fresh=fresh)


async def get_character_render(slug: str) -> bytes | None:
    """The cropped render PNG, or None when Blizzard has no render for the character."""
    cached = _fresh(_renders, slug)
    if cached is not None:
        return cached
    url = render_url((await _profile(slug)).media)
    if url is None:
        return None
    async with new_client() as client:
        png = await client.render(url)
    if png is None:
        return None
    cropped = await asyncio.to_thread(crop_render, png)
    _store(_renders, slug, cropped, CHARACTER_RENDER_CACHE_MAX_ENTRIES)
    return cropped


def clear_caches() -> None:
    """Tests start from nothing."""
    _profiles.clear()
    _renders.clear()
    _tokens.clear()
