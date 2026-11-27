"""Savings research runs end to end, with Anthropic mocked (no credits spent).

Pinned: a successful run stores the ideas, its token and search counts and
any server-tool error codes; the same idea found again updates the one row
and keeps a dismissal; a refusal, an Anthropic error, an unreadable reply, a
missing key or a crash each close the run as failed with its error type;
"Research now" needs research on, respects the daily limit and the one
running run; the daily sweep researches only for people who are due, closes
interrupted runs, and skips no one after a failure; the overview totals the
open ideas and says when the next run is due.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.extraction import (
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ResearchRefusedError,
    ResearchResponse,
    WebSource,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.savings_constants import MANUAL_RUNS_PER_DAY, RESEARCH_INTERVAL_HOURS
from app.core.savings_enums import (
    IDEA_STATUS_DISMISSED,
    RUN_ERROR_INTERNAL,
    RUN_ERROR_INTERRUPTED,
    RUN_ERROR_NOT_CONFIGURED,
    RUN_ERROR_UNPARSEABLE,
    RUN_STATUS_FAILED,
    RUN_STATUS_RUNNING,
    RUN_STATUS_SUCCEEDED,
    RUN_TRIGGER_MANUAL,
    RUN_TRIGGER_SCHEDULED,
)
from app.models.savings.savings_idea import SavingsIdea
from app.models.savings.savings_research_run import SavingsResearchRun
from app.repositories.savings import savings_run_repo, savings_setting_repo
from app.repositories.savings.run_already_running_error import RunAlreadyRunningError
from app.schemas.savings.savings_research_summary import SavingsResearchSummary
from app.services.savings import savings_overview_service, savings_research_service
from app.services.savings.manual_run_limit_error import ManualRunLimitError
from app.services.savings.research_disabled_error import ResearchDisabledError
from app.services.savings.savings_idea_not_found_error import SavingsIdeaNotFoundError

pytestmark = pytest.mark.asyncio

_SOURCE = "https://bank.example/bonus"
_SUMMARY = SavingsResearchSummary(
    as_of=_dt.date(2026, 11, 27), window_start=_dt.date(2025, 11, 27), yearly_spending_dollars=0,
    spending_by_category=[], recurring_charges=[], accounts=[], properties=[], mortgages=[],
    insurance_policies=[], utility_plans=[], budget=[], known_ideas=[],
)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _reply(*ideas: dict[str, Any]) -> ResearchResponse:
    return ResearchResponse(
        data={"ideas": list(ideas)},
        sources=[WebSource(url=_SOURCE, title="Bonus")],
        input_tokens=12_000, output_tokens=3_000, total_tokens=15_000, model="claude-opus-5-5",
        server_tool_uses=9, web_search_requests=6, web_fetch_requests=2,
        tool_error_codes=["web_fetch_tool_result:url_not_accessible"],
    )


def _idea(**overrides: Any) -> dict[str, Any]:
    idea: dict[str, Any] = {
        "category": "bank_bonus", "subject": "SoFi Checking", "title": "Open SoFi Checking for $300",
        "savings_low_dollars": 300, "savings_high_dollars": 300, "effort": "low",
        "why_it_fits": "Your $4,000 paycheck covers the direct deposit rule.",
        "steps": ["Open the account", "Set up direct deposit"], "source_urls": [_SOURCE],
        "expires_on": None, "card_details": None,
    }
    idea.update(overrides)
    return idea


@contextmanager
def _wired(db: AsyncSession, research: AsyncMock) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with (
        patch.object(savings_research_service, "unit_of_work", _uow),
        patch.object(savings_overview_service, "unit_of_work", _uow),
        patch.object(savings_research_service, "load_summary", AsyncMock(return_value=_SUMMARY)),
        patch.object(savings_research_service.research_service, "research", research),
    ):
        yield


async def _enable(db: AsyncSession, ids: dict[str, uuid.UUID]) -> None:
    await savings_setting_repo.set_enabled(db, **ids, enabled=True, now=_now())
    await db.commit()


async def _runs(db: AsyncSession) -> list[SavingsResearchRun]:
    result = await db.execute(select(SavingsResearchRun).order_by(SavingsResearchRun.started_at))
    return list(result.scalars().all())


async def _ideas(db: AsyncSession) -> list[SavingsIdea]:
    result = await db.execute(select(SavingsIdea))
    return list(result.scalars().all())


@pytest.fixture()
def ids() -> dict[str, uuid.UUID]:
    return {"organization_id": uuid.uuid4(), "user_id": uuid.uuid4()}


class TestRun:
    async def test_a_run_stores_ideas_and_its_accounting(self, db: AsyncSession, ids) -> None:
        research = AsyncMock(return_value=_reply(_idea()))
        with _wired(db, research):
            await _enable(db, ids)
            run_id = await savings_research_service.start_manual_run(**ids)
            await savings_research_service.execute_run(run_id, **ids)
        [run] = await _runs(db)
        assert run.status == RUN_STATUS_SUCCEEDED
        assert (run.input_tokens, run.output_tokens) == (12_000, 3_000)
        assert (run.web_search_count, run.web_fetch_count, run.ideas_found) == (6, 2, 1)
        assert run.tool_error_codes == ["web_fetch_tool_result:url_not_accessible"]
        assert run.finished_at is not None
        [idea] = await _ideas(db)
        assert idea.idea_key == "bank_bonus:sofi-checking"
        assert idea.last_run_id == run.id
        kwargs = research.await_args.kwargs
        assert kwargs["fallbacks"] is True
        assert kwargs["json_schema"]["required"] == ["ideas"]

    async def test_finding_an_idea_again_updates_it_and_keeps_a_dismissal(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock(return_value=_reply(_idea()))):
            await _enable(db, ids)
            await savings_research_service.execute_run(
                (await savings_research_service.start_manual_run(**ids)), **ids,
            )
        [idea] = await _ideas(db)
        first_found = idea.first_found_at
        idea.status = IDEA_STATUS_DISMISSED
        await db.commit()
        with _wired(db, AsyncMock(return_value=_reply(_idea(subject="sofi checking", savings_high_dollars=350)))):
            await savings_research_service.execute_run(
                (await savings_research_service.start_manual_run(**ids)), **ids,
            )
        [again] = await _ideas(db)
        assert again.status == IDEA_STATUS_DISMISSED
        assert again.savings_high_cents == 35_000
        assert again.first_found_at == first_found

    @pytest.mark.parametrize(
        ("error", "error_type"),
        [
            (ResearchRefusedError("cyber"), "refusal"),
            (ExtractionError("boom", error_type="overloaded_error"), "overloaded_error"),
            (ExtractionError("boom"), RUN_ERROR_INTERNAL),
            (ExtractionParseError("bad json"), RUN_ERROR_UNPARSEABLE),
            (ExtractionNotConfiguredError("no key"), RUN_ERROR_NOT_CONFIGURED),
            (RuntimeError("bug"), RUN_ERROR_INTERNAL),
        ],
    )
    async def test_a_failure_closes_the_run_with_its_type(
        self, db: AsyncSession, ids, error: Exception, error_type: str,
    ) -> None:
        with _wired(db, AsyncMock(side_effect=error)):
            await _enable(db, ids)
            await savings_research_service.execute_run(
                (await savings_research_service.start_manual_run(**ids)), **ids,
            )
        [run] = await _runs(db)
        assert (run.status, run.error_type) == (RUN_STATUS_FAILED, error_type)
        assert run.finished_at is not None
        assert await _ideas(db) == []


class TestResearchNow:
    async def test_needs_research_on(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock()), pytest.raises(ResearchDisabledError):
            await savings_research_service.start_manual_run(**ids)

    async def test_one_run_at_a_time(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock()):
            await _enable(db, ids)
            await savings_research_service.start_manual_run(**ids)
            with pytest.raises(RunAlreadyRunningError):
                await savings_research_service.start_manual_run(**ids)

    async def test_the_daily_limit_says_when_the_next_run_is_free(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock(return_value=_reply())):
            await _enable(db, ids)
            for _ in range(MANUAL_RUNS_PER_DAY):
                await savings_research_service.execute_run(
                    (await savings_research_service.start_manual_run(**ids)), **ids,
                )
            with pytest.raises(ManualRunLimitError) as caught:
                await savings_research_service.start_manual_run(**ids)
            overview = await savings_overview_service.get_overview(**ids)
        assert caught.value.next_available_at > _now()
        assert overview.manual_runs_left == 0
        assert overview.next_manual_run_at is not None


class TestFirstRun:
    async def test_turning_on_opens_one_scheduled_run_that_is_not_a_manual_one(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock()):
            assert await savings_research_service.start_first_run(**ids) is None
            await _enable(db, ids)
            run_id = await savings_research_service.start_first_run(**ids)
            assert run_id is not None
            assert await savings_research_service.start_first_run(**ids) is None
            overview = await savings_overview_service.get_overview(**ids)
        assert [run.trigger for run in await _runs(db)] == [RUN_TRIGGER_SCHEDULED]
        assert overview.manual_runs_left == MANUAL_RUNS_PER_DAY


class TestDailySweep:
    async def test_only_people_who_are_due_are_researched(self, db: AsyncSession) -> None:
        due, recent, off = ({"organization_id": uuid.uuid4(), "user_id": uuid.uuid4()} for _ in range(3))
        with _wired(db, AsyncMock(return_value=_reply(_idea()))):
            await _enable(db, due)
            await _enable(db, recent)
            run = await savings_run_repo.start(db, **recent, trigger=RUN_TRIGGER_MANUAL, now=_now())
            run.status, run.finished_at = RUN_STATUS_SUCCEEDED, _now()
            stale = await savings_run_repo.start(
                db, **due, trigger=RUN_TRIGGER_SCHEDULED,
                now=_now() - _dt.timedelta(hours=RESEARCH_INTERVAL_HOURS + 1),
            )
            await db.commit()
            started = await savings_research_service.run_due_research()
        assert started == 1
        await db.refresh(stale)
        assert stale.error_type == RUN_ERROR_INTERRUPTED
        runs = await _runs(db)
        newest = [r for r in runs if r.user_id == due["user_id"] and r.trigger == RUN_TRIGGER_SCHEDULED][-1]
        assert newest.status == RUN_STATUS_SUCCEEDED
        assert not [r for r in runs if r.user_id == off["user_id"]]

    async def test_one_failure_skips_no_one_else(self, db: AsyncSession) -> None:
        first, second = ({"organization_id": uuid.uuid4(), "user_id": uuid.uuid4()} for _ in range(2))
        research = AsyncMock(side_effect=[ExtractionError("x", error_type="api_error"), _reply(_idea())])
        with _wired(db, research):
            await _enable(db, first)
            await _enable(db, second)
            assert await savings_research_service.run_due_research() == 2
        statuses = sorted(run.status for run in await _runs(db))
        assert statuses == [RUN_STATUS_FAILED, RUN_STATUS_SUCCEEDED]


class TestOverview:
    async def test_totals_open_ideas_and_reports_progress(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock(return_value=_reply(_idea(), _idea(subject="Chime", savings_low_dollars=100,
                                                                     savings_high_dollars=200)))):
            off = await savings_overview_service.get_overview(**ids)
            await _enable(db, ids)
            run_id = await savings_research_service.start_manual_run(**ids)
            running = await savings_overview_service.get_overview(**ids)
            await savings_research_service.execute_run(run_id, **ids)
            done = await savings_overview_service.get_overview(**ids)
        assert not off.research_enabled and off.next_research_due_at is None
        assert running.run_in_progress and running.latest_run.status == RUN_STATUS_RUNNING
        assert running.next_research_due_at is None
        assert (done.total_savings_low_cents, done.total_savings_high_cents) == (40_000, 50_000)
        assert [idea.savings_high_cents for idea in done.ideas] == [30_000, 20_000]
        assert done.last_researched_at is not None
        assert done.next_research_due_at > _now()
        assert done.manual_runs_left == MANUAL_RUNS_PER_DAY - 1

    async def test_marking_an_idea_takes_it_off_the_list(self, db: AsyncSession, ids) -> None:
        with _wired(db, AsyncMock(return_value=_reply(_idea()))):
            await _enable(db, ids)
            await savings_research_service.execute_run(
                (await savings_research_service.start_manual_run(**ids)), **ids,
            )
            [idea] = (await savings_overview_service.get_overview(**ids)).ideas
            updated = await savings_overview_service.set_idea_status(**ids, idea_id=idea.id, status="done")
            after = await savings_overview_service.get_overview(**ids)
            with pytest.raises(SavingsIdeaNotFoundError):
                await savings_overview_service.set_idea_status(
                    organization_id=ids["organization_id"], user_id=uuid.uuid4(), idea_id=idea.id, status="done",
                )
        assert updated.status == "done"
        assert after.ideas == []
