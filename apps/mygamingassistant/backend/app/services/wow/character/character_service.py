"""Look up a WoW Forever character, with a short in-process cache.

One cached entry per character holds Blizzard's raw answers; the cropped
render is cached beside it. Both expire after ``CHARACTER_CACHE_SECONDS``, so a
player who logs out with new gear sees it within minutes, and a page that
loads the sheet and the picture asks Blizzard once.
"""
from __future__ import annotations

import asyncio
import time
from typing import TypeVar

from app.core.config import settings
from app.core.wow_character import CHARACTER_CACHE_MAX_ENTRIES, CHARACTER_CACHE_SECONDS
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character.blizzard_character_client import BlizzardCharacterClient
from app.services.wow.character.character_mapper import render_url, to_character_response
from app.services.wow.character.character_profile import CharacterProfile
from app.services.wow.character.character_render_crop import crop_render

T = TypeVar("T")

_tokens = BlizzardTokenCache()
_profiles: dict[str, tuple[CharacterProfile, float]] = {}
_renders: dict[str, tuple[bytes, float]] = {}


def _new_client() -> BlizzardCharacterClient:
    return BlizzardCharacterClient(settings.blizzard_client_id, settings.blizzard_client_secret, _tokens)


def _fresh(cache: dict[str, tuple[T, float]], slug: str) -> T | None:
    entry = cache.get(slug)
    if entry is None or time.monotonic() - entry[1] >= CHARACTER_CACHE_SECONDS:
        return None
    return entry[0]


def _store(cache: dict[str, tuple[T, float]], slug: str, value: T) -> None:
    if len(cache) >= CHARACTER_CACHE_MAX_ENTRIES:
        now = time.monotonic()
        for key in [k for k, (_, at) in cache.items() if now - at >= CHARACTER_CACHE_SECONDS]:
            del cache[key]
        if len(cache) >= CHARACTER_CACHE_MAX_ENTRIES:
            del cache[min(cache, key=lambda k: cache[k][1])]
    cache[slug] = (value, time.monotonic())


async def _profile(slug: str) -> CharacterProfile:
    cached = _fresh(_profiles, slug)
    if cached is not None:
        return cached
    async with _new_client() as client:
        profile = await client.profile(slug)
        media, equipment = await asyncio.gather(client.media(slug), client.equipment(slug))
    data = CharacterProfile(profile=profile, media=media, equipment=equipment)
    _store(_profiles, slug, data)
    return data


async def get_character(slug: str) -> CharacterResponse:
    """Raises ``CharacterLookupError`` (status 404 = no character by that name)."""
    return to_character_response(slug, await _profile(slug))


async def get_character_render(slug: str) -> bytes | None:
    """The cropped render PNG, or None when Blizzard has no render for the character."""
    cached = _fresh(_renders, slug)
    if cached is not None:
        return cached
    url = render_url((await _profile(slug)).media)
    if url is None:
        return None
    async with _new_client() as client:
        png = await client.render(url)
    cropped = await asyncio.to_thread(crop_render, png)
    _store(_renders, slug, cropped)
    return cropped


def clear_caches() -> None:
    """Tests start from nothing."""
    _profiles.clear()
    _renders.clear()
    _tokens.clear()

