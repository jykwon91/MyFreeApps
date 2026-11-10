"""SchedulerJob — one job registered in the scheduler process.

The scheduler runs in its own process (``app/workers/scheduler_worker.py``),
so this table is how the API and the scheduler talk:

* every tick the scheduler writes one row per registered job (trigger, next
  run) and stamps ``reported_at``; rows of jobs it no longer registers
  are deleted. The API's ``GET /scheduler/status`` reads them, and a
  restarted scheduler resumes each job's cadence from ``next_run_at``
  instead of pushing it a full interval out on every deploy.
* ``POST /scheduler/trigger/{job_id}`` sets ``run_requested_at``; the next
  tick starts the job and clears it.

Not tenant-scoped: the jobs are app-wide and only the operator reaches the
API surface.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SchedulerJob(Base):
    __tablename__ = "scheduler_job"
    __table_args__ = (
        # Its index serves every lookup: the scheduler's upserts and the trigger.
        UniqueConstraint("job_id", name="uq_schedulerjob_job_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    job_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # APScheduler's description of the trigger, e.g. "interval[6:00:00]".
    trigger: Mapped[str] = mapped_column(String(255), nullable=False)
    # NULL while the job is paused (APScheduler has no next run for it).
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set by the API's trigger, cleared by the scheduler when it starts the run.
    run_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # When the scheduler last wrote this row — the API's liveness signal.
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
