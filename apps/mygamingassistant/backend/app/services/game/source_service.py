"""Source business-logic service.

Orchestrates source CRUD and URL validation. ORM operations are delegated to
source_repo; this service owns validation logic and commit boundaries.
"""
from __future__ import annotations

import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.game.source import Source
from app.repositories.game.reference_repo import (
    game_slug_exists,
    get_game_slug_for_map,
)
from app.repositories.game.source_repo import (
    create_source,
    get_source,
    list_sources,
    soft_delete_source,
)
from app.schemas.game.source_schemas import SourceCreate


# ---------------------------------------------------------------------------
# URL validation patterns
# ---------------------------------------------------------------------------

# A playlist id can ride on the canonical /playlist?list=ID URL OR on a
# watch?v=VIDEO&list=ID URL (what YouTube hands you when you open a video
# from within a playlist — the most common copy-paste form). Accept both;
# we normalize to the canonical /playlist?list=ID form before storing.
_YOUTUBE_PLAYLIST_ID_RE = re.compile(r"[?&]list=([\w-]+)", re.IGNORECASE)
_YOUTUBE_CHANNEL_RE = re.compile(
    r"^https?://(?:www\.)?youtube\.com/(?:@[\w-]+|channel/[\w-]+|c/[\w-]+|user/[\w-]+)(?:/[\w-]*)?/?$",
    re.IGNORECASE,
)


def _extract_playlist_id(url: str) -> str | None:
    """Return the playlist id from any YouTube URL carrying a list= param."""
    if "youtube.com" not in url.lower() and "youtu.be" not in url.lower():
        return None
    match = _YOUTUBE_PLAYLIST_ID_RE.search(url)
    return match.group(1) if match else None


def validate_source_url(kind: str, url: str) -> str | None:
    """Return None if the URL is valid for the given kind, or an error string."""
    if kind == "youtube_playlist":
        if not _extract_playlist_id(url):
            return (
                "youtube_playlist URL must contain a playlist id, e.g. "
                "https://www.youtube.com/playlist?list=<id> or "
                "https://www.youtube.com/watch?v=<vid>&list=<id>"
            )
    elif kind == "youtube_channel":
        if not _YOUTUBE_CHANNEL_RE.match(url):
            return (
                "youtube_channel URL must be a YouTube channel URL: "
                "https://www.youtube.com/@handle  or  /channel/<id>  or  /c/<id>"
            )
    else:
        return f"Unsupported kind: {kind!r}"
    return None


def _build_config_json(kind: str, url: str) -> dict:
    """Build the config_json dict for a new Source."""
    if kind == "youtube_playlist":
        pid = _extract_playlist_id(url)
        canonical = f"https://www.youtube.com/playlist?list={pid}" if pid else url
        return {"url": canonical, "last_synced_at": None}
    if kind == "youtube_channel":
        return {"channel_url": url, "last_synced_at": None}
    return {"url": url}


async def _resolve_hints(
    db: AsyncSession, game_hint: str | None, map_hint: str | None
) -> dict:
    """Validate + normalize the source classification hints into config keys.

    ``map_hint`` implies (and overrides) ``game_hint`` to the map's own game,
    so a single ``map_hint=mirage`` drives both the map lock and the game
    scope. Raises ``ValueError`` on an unknown slug so the route surfaces a 422
    rather than silently storing a hint that can never match a real map/game
    (which would make the scope a no-op — see apply_map_hint). Slug lookups go
    through reference_repo, so this service issues no ORM queries of its own.
    """
    if map_hint:
        game_slug = await get_game_slug_for_map(db, map_hint)
        if game_slug is None:
            raise ValueError(f"map_hint '{map_hint}' is not a known map slug")
        return {"map_hint": map_hint, "game_hint": game_slug}  # map implies its game
    if game_hint:
        if not await game_slug_exists(db, game_hint):
            raise ValueError(f"game_hint '{game_hint}' is not a known game slug")
        return {"game_hint": game_hint}
    return {}


async def create(payload: SourceCreate) -> Source:
    """Create a new Source after validating the URL.

    Commits atomically via ``unit_of_work`` — the repo flushes + refreshes;
    the service owns the transaction boundary (route must NOT commit),
    mirroring the canonical MBK service pattern. ``expire_on_commit=False``
    keeps the refreshed instance usable after the UoW commits.
    """
    error = validate_source_url(payload.kind, payload.url)
    if error:
        raise ValueError(error)
    config = _build_config_json(payload.kind, payload.url)
    async with unit_of_work() as db:
        config.update(await _resolve_hints(db, payload.game_hint, payload.map_hint))
        return await create_source(db, kind=payload.kind, config_json=config)


async def get(db: AsyncSession, source_id: uuid.UUID) -> Source | None:
    return await get_source(db, source_id)


async def list_all(db: AsyncSession) -> list[Source]:
    return await list_sources(db)


async def delete(source_id: uuid.UUID) -> Source | None:
    """Soft-delete a source (marks deleted in config_json; doesn't remove rows).

    Commits atomically via ``unit_of_work`` — the repo flushes; the service
    owns the transaction boundary (route must NOT commit)."""
    async with unit_of_work() as db:
        source = await soft_delete_source(db, source_id)
        if source is None:
            return None
        return source
