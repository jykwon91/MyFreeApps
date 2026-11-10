"""One job in ``GET /api/scheduler/status``."""
from __future__ import annotations

from pydantic import BaseModel


class SchedulerJobStatus(BaseModel):
    id: str
    name: str
    next_run_at: str | None
    trigger: str
