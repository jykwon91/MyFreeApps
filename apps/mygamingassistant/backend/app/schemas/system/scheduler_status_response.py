"""``GET /api/scheduler/status`` response."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.system.scheduler_job_status import SchedulerJobStatus


class SchedulerStatusResponse(BaseModel):
    # True while the scheduler process reports in (see HEARTBEAT_MAX_AGE_SECONDS).
    running: bool
    # Empty while it is not running — its last report would be stale.
    jobs: list[SchedulerJobStatus]
