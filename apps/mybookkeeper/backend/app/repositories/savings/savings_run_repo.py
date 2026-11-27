"""Savings research runs: start one, finish it, and the questions the page and scheduler ask."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.savings_enums import (
    RUN_ERROR_INTERRUPTED,
    RUN_STATUS_FAILED,
    RUN_STATUS_RUNNING,
    RUN_STATUS_SUCCEEDED,
    RUN_TRIGGER_MANUAL,
)
from app.models.savings.savings_research_run import SavingsResearchRun
from app.repositories.savings.run_already_running_error import RunAlreadyRunningError


async def start(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    trigger: str,
    now: _dt.datetime,
) -> SavingsResearchRun:
    """Insert a ``running`` run, or raise when one is already running.

    The partial unique index ``uq_savings_runs_one_running`` is what decides,
    so a click and the daily job racing for the same person can't both win.
    The insert runs in a savepoint so a loss leaves the caller's session usable.
    """
    run = SavingsResearchRun(
        organization_id=organization_id,
        user_id=user_id,
        trigger=trigger,
        status=RUN_STATUS_RUNNING,
        started_at=now,
    )
    try:
        async with db.begin_nested():
            db.add(run)
            await db.flush()
    except IntegrityError as exc:
        raise RunAlreadyRunningError from exc
    return run


async def get(db: AsyncSession, run_id: uuid.UUID) -> SavingsResearchRun | None:
    return await db.get(SavingsResearchRun, run_id)


async def get_latest(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> SavingsResearchRun | None:
    result = await db.execute(
        select(SavingsResearchRun)
        .where(
            SavingsResearchRun.organization_id == organization_id,
            SavingsResearchRun.user_id == user_id,
        )
        .order_by(desc(SavingsResearchRun.started_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_latest_succeeded_finish(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> _dt.datetime | None:
    """When this person's last successful run finished: the page's "last researched"."""
    result = await db.execute(
        select(func.max(SavingsResearchRun.finished_at)).where(
            SavingsResearchRun.organization_id == organization_id,
            SavingsResearchRun.user_id == user_id,
            SavingsResearchRun.status == RUN_STATUS_SUCCEEDED,
        )
    )
    return result.scalar_one_or_none()


async def manual_starts_since(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID, since: _dt.datetime,
) -> list[_dt.datetime]:
    """Start times of this person's "Research now" runs since ``since``, oldest first."""
    result = await db.execute(
        select(SavingsResearchRun.started_at)
        .where(
            SavingsResearchRun.organization_id == organization_id,
            SavingsResearchRun.user_id == user_id,
            SavingsResearchRun.trigger == RUN_TRIGGER_MANUAL,
            SavingsResearchRun.started_at >= since,
        )
        .order_by(SavingsResearchRun.started_at)
    )
    return list(result.scalars().all())


async def close_stale(db: AsyncSession, *, started_before: _dt.datetime, now: _dt.datetime) -> int:
    """Close every run still ``running`` that started before ``started_before``.

    A run that long is one whose process was stopped mid-call (a deploy, a
    crash); left open it would block that person's next run forever.
    Returns how many were closed.
    """
    result = await db.execute(
        update(SavingsResearchRun)
        .where(
            SavingsResearchRun.status == RUN_STATUS_RUNNING,
            SavingsResearchRun.started_at < started_before,
        )
        .values(status=RUN_STATUS_FAILED, finished_at=now, error_type=RUN_ERROR_INTERRUPTED)
    )
    return result.rowcount or 0
