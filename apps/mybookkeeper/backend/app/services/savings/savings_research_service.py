"""Run savings research for a person: start a run, research, store the ideas.

A run is opened (``running``) before the Claude call and always closed after
it, succeeded or failed. A failure is recorded on the run with its error type
(Anthropic's ``error.type``, ``refusal``, or ours) and any server-tool error
codes the turn reported; it is never reduced to "it failed". The call takes
minutes, so no database session is held open across it.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from platform_shared.extraction import (
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ResearchRefusedError,
    ResearchResponse,
)

from app.core.datetime_utils import as_utc
from app.core.savings_constants import (
    MANUAL_RUN_WINDOW_HOURS,
    MANUAL_RUNS_PER_DAY,
    RESEARCH_EFFORT,
    RESEARCH_INTERVAL_HOURS,
    RESEARCH_MAX_FETCHES,
    RESEARCH_MAX_RATE_LIMIT_WAIT_SECONDS,
    RESEARCH_MAX_SEARCHES,
    RESEARCH_MAX_TOKENS,
    STALE_RUN_MINUTES,
)
from app.core.savings_enums import (
    RUN_ERROR_INTERNAL,
    RUN_ERROR_NOT_CONFIGURED,
    RUN_ERROR_UNPARSEABLE,
    RUN_STATUS_FAILED,
    RUN_STATUS_SUCCEEDED,
    RUN_TRIGGER_MANUAL,
    RUN_TRIGGER_SCHEDULED,
)
from app.db.session import unit_of_work
from app.repositories.savings import savings_idea_repo, savings_run_repo, savings_setting_repo
from app.repositories.savings.run_already_running_error import RunAlreadyRunningError
from app.mappers import savings_idea_mapper
from app.services.savings.manual_run_limit_error import ManualRunLimitError
from app.services.savings.prompts.savings_reply_schema import SAVINGS_REPLY_SCHEMA
from app.services.savings.prompts.savings_research_prompt import SAVINGS_SYSTEM_PROMPT, build_user_prompt
from app.services.savings.research_disabled_error import ResearchDisabledError
from app.services.savings.savings_research_client import research_service
from app.services.savings.savings_summary_loader import load_summary

logger = logging.getLogger(__name__)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def manual_runs_left(starts: list[_dt.datetime]) -> int:
    return max(MANUAL_RUNS_PER_DAY - len(starts), 0)


def next_manual_run_at(starts: list[_dt.datetime]) -> _dt.datetime | None:
    """When the oldest manual run in the window ages out, if the limit is reached."""
    if manual_runs_left(starts) > 0 or not starts:
        return None
    return as_utc(starts[0]) + _dt.timedelta(hours=MANUAL_RUN_WINDOW_HOURS)


async def start_manual_run(*, organization_id: uuid.UUID, user_id: uuid.UUID) -> uuid.UUID:
    """Open a "Research now" run and return its id; the caller runs it in the background.

    Raises ``ResearchDisabledError``, ``ManualRunLimitError`` or ``RunAlreadyRunningError``.
    """
    now = _now()
    async with unit_of_work() as db:
        setting = await savings_setting_repo.get(db, organization_id=organization_id, user_id=user_id)
        if setting is None or not setting.enabled:
            raise ResearchDisabledError
        await savings_run_repo.close_stale(
            db, started_before=now - _dt.timedelta(minutes=STALE_RUN_MINUTES), now=now,
        )
        starts = await savings_run_repo.manual_starts_since(
            db,
            organization_id=organization_id,
            user_id=user_id,
            since=now - _dt.timedelta(hours=MANUAL_RUN_WINDOW_HOURS),
        )
        next_at = next_manual_run_at(starts)
        if next_at is not None:
            raise ManualRunLimitError(next_at)
        run = await savings_run_repo.start(
            db, organization_id=organization_id, user_id=user_id, trigger=RUN_TRIGGER_MANUAL, now=now,
        )
        return run.id


async def _finish(
    run_id: uuid.UUID,
    *,
    status: str,
    error_type: str | None = None,
    response: ResearchResponse | None = None,
    ideas_found: int = 0,
) -> None:
    async with unit_of_work() as db:
        run = await savings_run_repo.get(db, run_id)
        if run is None:
            return
        run.status = status
        run.finished_at = _now()
        run.error_type = error_type
        run.ideas_found = ideas_found
        if response is not None:
            run.model = response.model
            run.input_tokens = response.input_tokens
            run.output_tokens = response.output_tokens
            run.web_search_count = response.web_search_requests
            run.web_fetch_count = response.web_fetch_requests
            run.tool_error_codes = list(response.tool_error_codes)


async def _store_ideas(
    run_id: uuid.UUID,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    response: ResearchResponse,
    today: _dt.date,
) -> int:
    parsed = savings_idea_mapper.parse_reply(
        response.data, retrieved_urls=[source.url for source in response.sources], today=today,
    )
    now = _now()
    async with unit_of_work() as db:
        existing = await savings_idea_repo.get_by_keys(
            db, organization_id=organization_id, user_id=user_id, keys=[idea.idea_key for idea in parsed],
        )
        for idea in parsed:
            current = existing.get(idea.idea_key)
            if current is None:
                await savings_idea_repo.add(
                    db,
                    savings_idea_mapper.new_idea(
                        idea, organization_id=organization_id, user_id=user_id, run_id=run_id, now=now,
                    ),
                )
            else:
                savings_idea_mapper.refresh_idea(current, idea, run_id=run_id, now=now)
    return len(parsed)


async def execute_run(run_id: uuid.UUID, *, organization_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Research for an open run and close it. Never raises: every outcome lands on the run."""
    today = _now().date()
    try:
        summary = await load_summary(organization_id=organization_id, user_id=user_id, today=today)
        response = await research_service.research(
            SAVINGS_SYSTEM_PROMPT,
            build_user_prompt(summary),
            json_schema=SAVINGS_REPLY_SCHEMA,
            max_searches=RESEARCH_MAX_SEARCHES,
            max_fetches=RESEARCH_MAX_FETCHES,
            max_tokens=RESEARCH_MAX_TOKENS,
            effort=RESEARCH_EFFORT,
            fallbacks=True,
            max_wait_seconds=RESEARCH_MAX_RATE_LIMIT_WAIT_SECONDS,
        )
    except ExtractionNotConfiguredError:
        logger.error("Savings research run %s: Anthropic is not configured", run_id)
        await _finish(run_id, status=RUN_STATUS_FAILED, error_type=RUN_ERROR_NOT_CONFIGURED)
        return
    except ResearchRefusedError as exc:
        logger.warning("Savings research run %s refused: category=%s", run_id, exc.category)
        await _finish(run_id, status=RUN_STATUS_FAILED, error_type=exc.error_type)
        return
    except ExtractionParseError as exc:
        logger.warning("Savings research run %s: reply unreadable: %s", run_id, type(exc).__name__)
        await _finish(run_id, status=RUN_STATUS_FAILED, error_type=exc.error_type or RUN_ERROR_UNPARSEABLE)
        return
    except ExtractionError as exc:
        logger.warning("Savings research run %s failed: error_type=%s", run_id, exc.error_type)
        await _finish(run_id, status=RUN_STATUS_FAILED, error_type=exc.error_type or RUN_ERROR_INTERNAL)
        return
    except Exception:
        logger.exception("Savings research run %s crashed before the reply", run_id)
        await _finish(run_id, status=RUN_STATUS_FAILED, error_type=RUN_ERROR_INTERNAL)
        return

    if response.tool_error_codes:
        logger.warning("Savings research run %s: server tool errors %s", run_id, response.tool_error_codes)
    try:
        found = await _store_ideas(
            run_id, organization_id=organization_id, user_id=user_id, response=response, today=today,
        )
    except Exception:
        logger.exception("Savings research run %s could not store its ideas", run_id)
        await _finish(run_id, status=RUN_STATUS_FAILED, error_type=RUN_ERROR_INTERNAL, response=response)
        return
    await _finish(run_id, status=RUN_STATUS_SUCCEEDED, response=response, ideas_found=found)
    logger.info(
        "Savings research run %s: %d ideas, %d searches, %d fetches, %d in / %d out tokens",
        run_id, found, response.web_search_requests, response.web_fetch_requests,
        response.input_tokens, response.output_tokens,
    )


async def _open_scheduled_run(*, organization_id: uuid.UUID, user_id: uuid.UUID) -> uuid.UUID | None:
    """Open a scheduled run in its own transaction; None when one is already running."""
    async with unit_of_work() as db:
        try:
            run = await savings_run_repo.start(
                db, organization_id=organization_id, user_id=user_id, trigger=RUN_TRIGGER_SCHEDULED, now=_now(),
            )
        except RunAlreadyRunningError:
            return None
        return run.id


async def start_first_run(*, organization_id: uuid.UUID, user_id: uuid.UUID) -> uuid.UUID | None:
    """Open the first run for someone who just turned research on, so they needn't wait for the scheduler.

    Scheduled, not manual: it doesn't count against "Research now". None when
    research is off or they've had a run before.
    """
    async with unit_of_work() as db:
        setting = await savings_setting_repo.get(db, organization_id=organization_id, user_id=user_id)
        if setting is None or not setting.enabled:
            return None
        if await savings_run_repo.get_latest(db, organization_id=organization_id, user_id=user_id) is not None:
            return None
    return await _open_scheduled_run(organization_id=organization_id, user_id=user_id)


async def run_due_research() -> int:
    """The scheduler's step: research for everyone who has it on and is due.

    Due = no run started in the last ``RESEARCH_INTERVAL_HOURS``. Runs one
    person at a time, opening each run only when its turn comes, so a long
    queue never leaves runs "running" past the stale cutoff. Returns how many
    runs it started.
    """
    now = _now()
    due_before = now - _dt.timedelta(hours=RESEARCH_INTERVAL_HOURS)
    due: list[tuple[uuid.UUID, uuid.UUID]] = []
    async with unit_of_work() as db:
        closed = await savings_run_repo.close_stale(
            db, started_before=now - _dt.timedelta(minutes=STALE_RUN_MINUTES), now=now,
        )
        if closed:
            logger.warning("Savings research: closed %d interrupted runs", closed)
        for setting in await savings_setting_repo.list_enabled(db):
            latest = await savings_run_repo.get_latest(
                db, organization_id=setting.organization_id, user_id=setting.user_id,
            )
            if latest is None or as_utc(latest.started_at) <= due_before:
                due.append((setting.organization_id, setting.user_id))
    started = 0
    for organization_id, user_id in due:
        run_id = await _open_scheduled_run(organization_id=organization_id, user_id=user_id)
        if run_id is None:
            continue
        started += 1
        await execute_run(run_id, organization_id=organization_id, user_id=user_id)
    return started
