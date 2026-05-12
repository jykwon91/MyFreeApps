"""Source repository — data access layer for the source table.

Sources represent YouTube playlists or channels that are periodically
synced to extract lineup videos.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.source import Source


async def create_source(
    db: AsyncSession,
    *,
    kind: str,
    config_json: dict,
) -> Source:
    """Insert a new Source row and flush."""
    source = Source(kind=kind, config_json=config_json)
    db.add(source)
    await db.flush()
    await db.refresh(source)
    return source


async def get_source(
    db: AsyncSession,
    source_id: uuid.UUID,
) -> Source | None:
    """Return a single source by id, or None."""
    result = await db.execute(select(Source).where(Source.id == source_id))
    return result.scalar_one_or_none()


async def list_sources(db: AsyncSession) -> list[Source]:
    """Return all sources ordered by creation date descending."""
    result = await db.execute(select(Source).order_by(Source.created_at.desc()))
    return list(result.scalars().all())


async def soft_delete_source(
    db: AsyncSession,
    source_id: uuid.UUID,
) -> Source | None:
    """Mark a source as deleted (sets config_json.deleted=True).

    We never hard-delete sources because their orphaned lineups still
    reference source_id via SET NULL FK. This prevents FK errors on lineups
    that were already accepted before the source was removed.
    """
    source = await get_source(db, source_id)
    if source is None:
        return None
    # Store deleted flag in config_json (Source has no deleted_at column).
    # This is a deliberate design choice: sources are rare; a full soft-delete
    # column is not worth a migration for now.
    config = dict(source.config_json)
    config["deleted"] = True
    source.config_json = config
    await db.flush()
    return source


async def update_sync_stats(
    db: AsyncSession,
    source: Source,
    *,
    synced_at: Optional[datetime] = None,
    video_count: int = 0,
    chapter_count: int = 0,
    error_count: int = 0,
) -> Source:
    """Record sync results on the source row."""
    source.last_synced_at = synced_at or datetime.now(timezone.utc)
    config = dict(source.config_json)
    config["last_sync_stats"] = {
        "video_count": video_count,
        "chapter_count": chapter_count,
        "error_count": error_count,
        "synced_at": source.last_synced_at.isoformat(),
    }
    source.config_json = config
    await db.flush()
    return source
