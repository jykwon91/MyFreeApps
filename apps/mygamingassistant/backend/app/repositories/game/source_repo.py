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


async def upsert_source(
    db: AsyncSession,
    *,
    source_id: uuid.UUID,
    kind: str,
    config_json: dict,
) -> Source:
    """Insert a source with an EXPLICIT id, or update an existing one. Flush-only.

    Used by the library importer to re-create the sources a published pack
    references, carrying their verbatim UUIDs so a lineup's ``source_id`` FK
    resolves with no slug indirection (sources are not fixtures → their PKs do
    not collide and are safe to import by id). Idempotent: re-running updates
    ``kind`` / ``config_json`` in place. Uses ``db.get`` (not ``get_source``)
    so a soft-deleted row is still located and refreshed rather than
    duplicated. The caller owns the transaction (no commit here).
    """
    existing = await db.get(Source, source_id)
    if existing is not None:
        existing.kind = kind
        existing.config_json = config_json
        await db.flush()
        return existing
    source = Source(id=source_id, kind=kind, config_json=config_json)
    db.add(source)
    await db.flush()
    return source


def _is_deleted(source: Source) -> bool:
    return bool((source.config_json or {}).get("deleted"))


async def get_source(
    db: AsyncSession,
    source_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> Source | None:
    """Return a single source by id, or None.

    Soft-deleted sources (config_json.deleted=True) are hidden by default so
    they can't be fetched, synced, or shown in detail. soft_delete_source
    passes include_deleted=True so it can still locate the row to mark.
    """
    result = await db.execute(select(Source).where(Source.id == source_id))
    source = result.scalar_one_or_none()
    if source is None:
        return None
    if not include_deleted and _is_deleted(source):
        return None
    return source


async def list_sources(db: AsyncSession) -> list[Source]:
    """Return all non-deleted sources, newest first.

    config_json is JSON (not JSONB) and sources are few, so the deleted
    filter is applied in Python rather than via a JSON-path WHERE clause.
    """
    result = await db.execute(select(Source).order_by(Source.created_at.desc()))
    return [s for s in result.scalars().all() if not _is_deleted(s)]


async def soft_delete_source(
    db: AsyncSession,
    source_id: uuid.UUID,
) -> Source | None:
    """Mark a source as deleted (sets config_json.deleted=True).

    We never hard-delete sources because their orphaned lineups still
    reference source_id via SET NULL FK. This prevents FK errors on lineups
    that were already accepted before the source was removed.
    """
    source = await get_source(db, source_id, include_deleted=True)
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


async def replace_source_hints(
    db: AsyncSession,
    source: Source,
    *,
    hints: dict,
) -> Source:
    """Replace the classification-scope keys (game_hint/map_hint) in config_json.

    REPLACE semantics: the two scope keys are dropped and re-set from *hints*
    (``{}`` clears the scope; ``{"game_hint": ...}`` or ``{"map_hint": ...,
    "game_hint": ...}`` set it). Other config_json keys (url, last_sync_stats,
    deleted, …) are preserved. Reassigns a NEW dict so SQLAlchemy detects the
    change on the JSON column, mirroring update_sync_stats / soft_delete_source.
    The caller (source_service.update_hints) owns the commit via unit_of_work.
    """
    config = dict(source.config_json or {})
    config.pop("game_hint", None)
    config.pop("map_hint", None)
    config.update(hints)
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


async def record_sync_stats(
    db: AsyncSession,
    source: Source,
    *,
    synced_at: Optional[datetime] = None,
    video_count: int = 0,
    chapter_count: int = 0,
    error_count: int = 0,
) -> Source:
    """Write sync stats onto the source row and commit atomically.

    Single transaction-owning entrypoint for the ingestion orchestrator
    (which runs its own background session). Mirrors ``lineup_repo``'s
    commit-owning mutators per PR #687: the flush + commit + rollback all
    live here so neither a flush failure nor a commit failure can leave the
    session with a half-applied ``config_json``. On any failure the
    transaction is rolled back and the error re-raised so the caller's
    structured-logging seam can record it (with exc_info).
    """
    try:
        await update_sync_stats(
            db,
            source,
            synced_at=synced_at,
            video_count=video_count,
            chapter_count=chapter_count,
            error_count=error_count,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return source
