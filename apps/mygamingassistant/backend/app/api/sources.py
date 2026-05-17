"""Source management API routes — operator only.

All source management is operator-only. Adding / inspecting / syncing
YouTube playlists or channels is an operational action that doesn't belong
in the public surface.

POST   /api/sources                  — add a YouTube playlist or channel
GET    /api/sources                  — list all sources
GET    /api/sources/{id}             — source detail
DELETE /api/sources/{id}             — soft-delete
POST   /api/sources/{id}/sync        — kick off a sync (runs as BackgroundTask)

Sync is synchronous in PR 4 (BackgroundTask). PR 6 adds APScheduler cron.

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.game.source_schemas import SourceCreate, SourceRead, SyncJobResponse
from app.services.game import source_service
from app.services.ingestion import ingestion_orchestrator

# Sources are entirely operator-gated. The single auth router covers the
# whole module — there is no public surface for source management.
router = APIRouter(
    tags=["sources"],
    dependencies=[Depends(current_active_user)],
)


def _source_to_read(source) -> SourceRead:
    last_synced = source.last_synced_at.isoformat() if source.last_synced_at else None
    created = source.created_at.isoformat() if source.created_at else ""
    return SourceRead(
        id=source.id,
        kind=source.kind,
        config_json=source.config_json,
        last_synced_at=last_synced,
        created_at=created,
    )


@router.post("/sources", response_model=SourceRead, status_code=201)
async def create_source(
    payload: SourceCreate,
    db: AsyncSession = Depends(get_db),
) -> SourceRead:
    """Add a YouTube playlist or channel as an ingestion source."""
    try:
        source = await source_service.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _source_to_read(source)


@router.get("/sources", response_model=list[SourceRead])
async def list_sources(
    db: AsyncSession = Depends(get_db),
) -> list[SourceRead]:
    """List all sources."""
    sources = await source_service.list_all(db)
    return [_source_to_read(s) for s in sources]


@router.get("/sources/{source_id}", response_model=SourceRead)
async def get_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SourceRead:
    """Get source detail."""
    source = await source_service.get(db, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return _source_to_read(source)


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a source.

    Lineups previously ingested from this source are NOT removed — they remain
    in the library with source_id set to NULL (SET NULL FK constraint).
    """
    source = await source_service.delete(db, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")


@router.post("/sources/{source_id}/sync", response_model=SyncJobResponse)
async def sync_source(
    source_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> SyncJobResponse:
    """Kick off an immediate sync for a source.

    Returns immediately; the actual ingestion runs as a background task.
    PR 6 will replace this with an APScheduler cron job.
    """
    source = await source_service.get(db, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    job_id = str(uuid.uuid4())

    async def _run_sync() -> None:
        """Background task: run full ingestion pipeline for one source."""
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as bg_db:
            await ingestion_orchestrator.sync_source(source_id, bg_db)

    background_tasks.add_task(_run_sync)

    return SyncJobResponse(
        job_id=job_id,
        source_id=source_id,
        status="queued",
        message="Sync started — lineups will appear in pending_review when complete",
    )
