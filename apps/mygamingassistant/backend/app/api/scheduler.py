"""Scheduler admin API.

GET  /api/scheduler/status           — list jobs, next_run_at
POST /api/scheduler/trigger/{job_id} — manually trigger a job

Auth-gated to the seeded user (current_active_user). These are operational
endpoints for the operator to inspect and trigger jobs — not test helpers.

Available job IDs:
  sync_all_sources         — run a full source sync pass immediately
  cleanup_ingestion_downloads — run a disk-cleanup pass immediately
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import current_active_user
from app.models.user.user import User
from app.services.scheduling.scheduler_service import (
    JOB_CLEANUP_DOWNLOADS,
    JOB_SYNC_ALL_SOURCES,
    SchedulerNotStartedError,
    get_job_status,
    trigger_job,
)

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])

KNOWN_JOB_IDS = frozenset({JOB_SYNC_ALL_SOURCES, JOB_CLEANUP_DOWNLOADS})


class JobStatus(BaseModel):
    id: str
    name: str
    next_run_at: str | None
    trigger: str


class SchedulerStatusResponse(BaseModel):
    running: bool
    jobs: list[JobStatus]


class TriggerResponse(BaseModel):
    job_id: str
    triggered: bool
    message: str


@router.get("/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    _user: User = Depends(current_active_user),
) -> SchedulerStatusResponse:
    """Return scheduler status and job details."""
    from app.services.scheduling.scheduler_service import get_scheduler

    scheduler = get_scheduler()
    running = scheduler is not None and scheduler.running
    jobs_raw = get_job_status()

    return SchedulerStatusResponse(
        running=running,
        jobs=[JobStatus(**j) for j in jobs_raw],
    )


@router.post("/trigger/{job_id}", response_model=TriggerResponse)
async def trigger_scheduler_job(
    job_id: str,
    _user: User = Depends(current_active_user),
) -> TriggerResponse:
    """Manually trigger a scheduler job by ID.

    Triggers the job to run at the next scheduler tick (effectively immediately).
    Does not wait for the job to complete — returns as soon as the job is queued.

    Known job IDs:
    - ``sync_all_sources`` — run a full source sync pass
    - ``cleanup_ingestion_downloads`` — run a disk cleanup pass
    """
    if job_id not in KNOWN_JOB_IDS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown job_id '{job_id}'. Valid IDs: {sorted(KNOWN_JOB_IDS)}",
        )

    try:
        triggered = await trigger_job(job_id)
    except SchedulerNotStartedError:
        raise HTTPException(
            status_code=503,
            detail="Scheduler is not running. Set SCHEDULER_ENABLED=true and restart.",
        )

    if not triggered:
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_id}' not found in scheduler. "
                   "The scheduler may have been restarted — check /api/scheduler/status.",
        )

    return TriggerResponse(
        job_id=job_id,
        triggered=True,
        message=f"Job '{job_id}' scheduled to run immediately.",
    )
