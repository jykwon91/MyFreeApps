"""Source business-logic service.

Orchestrates source CRUD and URL validation. ORM operations are delegated to
source_repo; this service owns validation logic and commit boundaries.
"""
from __future__ import annotations

import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.source import Source
from app.repositories.game.source_repo import (
    create_source,
    get_source,
    list_sources,
    soft_delete_source,
)
from app.schemas.game.lineup_schemas import SourceCreate


# ---------------------------------------------------------------------------
# URL validation patterns
# ---------------------------------------------------------------------------

_YOUTUBE_PLAYLIST_RE = re.compile(
    r"^https?://(?:www\.)?youtube\.com/playlist\?list=[\w-]+",
    re.IGNORECASE,
)
_YOUTUBE_CHANNEL_RE = re.compile(
    r"^https?://(?:www\.)?youtube\.com/(?:@[\w-]+|channel/[\w-]+|c/[\w-]+|user/[\w-]+)(?:/[\w-]*)?/?$",
    re.IGNORECASE,
)


def validate_source_url(kind: str, url: str) -> str | None:
    """Return None if the URL is valid for the given kind, or an error string."""
    if kind == "youtube_playlist":
        if not _YOUTUBE_PLAYLIST_RE.match(url):
            return (
                "youtube_playlist URL must be a YouTube playlist URL: "
                "https://www.youtube.com/playlist?list=<id>"
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
        return {"url": url, "last_synced_at": None}
    if kind == "youtube_channel":
        return {"channel_url": url, "last_synced_at": None}
    return {"url": url}


async def create(db: AsyncSession, payload: SourceCreate) -> Source:
    """Create a new Source after validating the URL."""
    error = validate_source_url(payload.kind, payload.url)
    if error:
        raise ValueError(error)
    config = _build_config_json(payload.kind, payload.url)
    source = await create_source(db, kind=payload.kind, config_json=config)
    await db.commit()
    await db.refresh(source)
    return source


async def get(db: AsyncSession, source_id: uuid.UUID) -> Source | None:
    return await get_source(db, source_id)


async def list_all(db: AsyncSession) -> list[Source]:
    return await list_sources(db)


async def delete(db: AsyncSession, source_id: uuid.UUID) -> Source | None:
    """Soft-delete a source (marks deleted in config_json; doesn't remove rows)."""
    source = await soft_delete_source(db, source_id)
    if source is None:
        return None
    await db.commit()
    return source
