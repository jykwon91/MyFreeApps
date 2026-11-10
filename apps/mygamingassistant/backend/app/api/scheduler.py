"""Scheduler admin API — operator only.

GET  /api/scheduler/status           — is the scheduler running; its jobs and next runs
POST /api/scheduler/trigger/{job_id} — ask the scheduler to run a job now

The scheduler runs in its own ``scheduler`` service, not in the API, so both
go through the ``scheduler_job`` table (``scheduler_control_service``): a
triggered job starts within ``TICK_INTERVAL_SECONDS`` — or, if it is running
already, once that run finishes. Repeated triggers before it starts are one
run. See ``scheduler_control_service`` for the one gap (a job switched off by
the deploy in progress).

Triggerable job IDs: ``sync_all_sources``, ``cleanup_ingestion_downloads``,
``refresh_wow_prices``.

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import current_active_user
from app.core.scheduler_constants import TICK_INTERVAL_SECONDS, TRIGGERABLE_JOB_IDS
from app.schemas.system.scheduler_status_response import SchedulerStatusResponse
from app.schemas.system.scheduler_trigger_response import SchedulerTriggerResponse
from app.services.scheduling import scheduler_control_service
from app.services.scheduling.job_not_scheduled_error import JobNotScheduledError
from app.services.scheduling.scheduler_not_running_error import SchedulerNotRunningError

# Auth-gated at the router level.
router = APIRouter(
    prefix="/scheduler",
    tags=["scheduler"],
    dependencies=[Depends(current_active_user)],
)


@router.get("/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status() -> SchedulerStatusResponse:
    """Return whether the scheduler is running and, if so, its jobs."""
    return await scheduler_control_service.get_status()


@router.post("/trigger/{job_id}", response_model=SchedulerTriggerResponse)
async def trigger_scheduler_job(job_id: str) -> SchedulerTriggerResponse:
    """Ask the scheduler to run a job now. Returns once the request is recorded."""
    if job_id not in TRIGGERABLE_JOB_IDS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown job_id '{job_id}'. Valid IDs: {sorted(TRIGGERABLE_JOB_IDS)}",
        )

    try:
        await scheduler_control_service.request_run(job_id)
    except SchedulerNotRunningError:
        raise HTTPException(
            status_code=503,
            detail="The scheduler service is not running — check `docker compose ps scheduler`.",
        )
    except JobNotScheduledError:
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_id}' is not scheduled (its switch is off) — check /api/scheduler/status.",
        )

    return SchedulerTriggerResponse(
        job_id=job_id,
        triggered=True,
        message=(
            f"Job '{job_id}' will start within {TICK_INTERVAL_SECONDS} seconds, "
            "or once its current run finishes."
        ),
    )
