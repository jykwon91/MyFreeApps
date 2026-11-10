"""What the scheduler process reports about one registered job each tick."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ScheduledJobSnapshot:
    job_id: str
    trigger: str
    # None while the job is paused.
    next_run_at: datetime | None
