"""The Savings page's reads and the person's choices: research on/off, idea status."""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.datetime_utils import as_utc
from app.core.savings_constants import (
    IDEA_STALE_DAYS,
    MANUAL_RUN_WINDOW_HOURS,
    MANUAL_RUNS_PER_DAY,
    RESEARCH_INTERVAL_HOURS,
)
from app.core.savings_enums import RUN_STATUS_RUNNING
from app.db.session import unit_of_work
from app.mappers import savings_response_mapper
from app.models.savings.savings_research_run import SavingsResearchRun
from app.repositories.savings import savings_idea_repo, savings_run_repo, savings_setting_repo
from app.schemas.savings.savings_idea_response import SavingsIdeaResponse
from app.schemas.savings.savings_overview_response import SavingsOverviewResponse
from app.services.savings.savings_idea_not_found_error import SavingsIdeaNotFoundError
from app.services.savings.savings_research_service import manual_runs_left, next_manual_run_at


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _next_research_due(
    latest: SavingsResearchRun | None, *, enabled: bool, running: bool, now: _dt.datetime,
) -> _dt.datetime | None:
    """The scheduler's next pick-up: a day after the last start, or now if never run."""
    if not enabled or running:
        return None
    if latest is None:
        return now
    return as_utc(latest.started_at) + _dt.timedelta(hours=RESEARCH_INTERVAL_HOURS)


async def get_overview(*, organization_id: uuid.UUID, user_id: uuid.UUID) -> SavingsOverviewResponse:
    now = _now()
    async with unit_of_work() as db:
        setting = await savings_setting_repo.get(db, organization_id=organization_id, user_id=user_id)
        ideas = await savings_idea_repo.list_open(
            db,
            organization_id=organization_id,
            user_id=user_id,
            confirmed_since=now - _dt.timedelta(days=IDEA_STALE_DAYS),
            today=now.date(),
        )
        latest = await savings_run_repo.get_latest(db, organization_id=organization_id, user_id=user_id)
        last_researched = await savings_run_repo.get_latest_succeeded_finish(
            db, organization_id=organization_id, user_id=user_id,
        )
        starts = await savings_run_repo.manual_starts_since(
            db,
            organization_id=organization_id,
            user_id=user_id,
            since=now - _dt.timedelta(hours=MANUAL_RUN_WINDOW_HOURS),
        )

    enabled = bool(setting and setting.enabled)
    running = latest is not None and latest.status == RUN_STATUS_RUNNING
    next_due = _next_research_due(latest, enabled=enabled, running=running, now=now)
    return SavingsOverviewResponse(
        research_enabled=enabled,
        total_savings_low_cents=sum(idea.savings_low_cents for idea in ideas),
        total_savings_high_cents=sum(idea.savings_high_cents for idea in ideas),
        last_researched_at=as_utc(last_researched) if last_researched else None,
        next_research_due_at=next_due,
        run_in_progress=running,
        latest_run=savings_response_mapper.run_to_response(latest) if latest else None,
        manual_runs_left=manual_runs_left(starts),
        manual_run_limit=MANUAL_RUNS_PER_DAY,
        next_manual_run_at=next_manual_run_at(starts),
        ideas=[savings_response_mapper.idea_to_response(idea) for idea in ideas],
    )


async def set_research_enabled(*, organization_id: uuid.UUID, user_id: uuid.UUID, enabled: bool) -> None:
    async with unit_of_work() as db:
        await savings_setting_repo.set_enabled(
            db, organization_id=organization_id, user_id=user_id, enabled=enabled, now=_now(),
        )


async def set_idea_status(
    *, organization_id: uuid.UUID, user_id: uuid.UUID, idea_id: uuid.UUID, status: str,
) -> SavingsIdeaResponse:
    async with unit_of_work() as db:
        idea = await savings_idea_repo.get(db, organization_id=organization_id, user_id=user_id, idea_id=idea_id)
        if idea is None:
            raise SavingsIdeaNotFoundError
        if idea.status != status:
            idea.status = status
            idea.status_changed_at = _now()
            await db.flush()
        return savings_response_mapper.idea_to_response(idea)
