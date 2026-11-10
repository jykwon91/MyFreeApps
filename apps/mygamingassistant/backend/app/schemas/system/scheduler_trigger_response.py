"""``POST /api/scheduler/trigger/{job_id}`` response."""
from __future__ import annotations

from pydantic import BaseModel


class SchedulerTriggerResponse(BaseModel):
    job_id: str
    triggered: bool
    message: str
