"""A company's research can't be run twice at once, and holds no connection while it runs.

Each run is a paid Tavily search plus a Claude call, 10-30 s long. Leaving the
company and coming back (or a second tab or device) used to start a second run
of the same company while the first was in flight. The server claims the run
by stamping ``companies.research_started_at`` in a short transaction, so the
second request is refused with 409 before anything is spent, and no pooled
connection waits idle in a transaction on Tavily or Claude.

The "other run" here is a real claim taken through the service.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import anyio
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import companies
from app.core.company_research_constants import COMPANY_RESEARCH_CLAIM_LEASE
from app.core.rate_limit import RateLimiter
from app.db.session import engine as app_engine
from app.db.session import unit_of_work
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.services.company import company_research_service
from app.services.company.research_already_running_error import ResearchAlreadyRunningError
from app.services.company.research_run_claim import ResearchRunClaim

_SERVICE = "app.services.company.company_research_service"

_TAVILY_RESULTS = [
    {
        "url": "https://glassdoor.com/reviews/in-flight-corp",
        "title": "In Flight Corp Reviews",
        "content": "Good place to work.",
        "score": 0.9,
        "source_type": "glassdoor",
    },
]

_CLAUDE_RESPONSE = {
    "summary": "Well regarded.",
    "description": "Builds software.",
    "sentiment": "positive",
    "compensation_signals": None,
    "culture_signals": "Collaborative.",
    "red_flags": [],
    "green_flags": ["Good pay"],
    "products_for_you": None,
}


@pytest.fixture
def one_run_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    """A research quota of one run, so a request that wrongly spends it shows up at once."""
    monkeypatch.setattr(companies, "_RESEARCH_LIMITER_PER_5_MIN", RateLimiter(max_attempts=1, window_seconds=300))
    monkeypatch.setattr(companies, "_RESEARCH_LIMITER_PER_HOUR", RateLimiter(max_attempts=1000, window_seconds=3600))


@contextmanager
def _paid_calls() -> Iterator[tuple[AsyncMock, AsyncMock]]:
    """Mock the search and the AI call, yielding them so a test can check whether they were spent."""
    search = AsyncMock(return_value=_TAVILY_RESULTS)
    claude = AsyncMock(return_value=_CLAUDE_RESPONSE)
    with (
        patch(f"{_SERVICE}.search_company", new=search),
        patch(f"{_SERVICE}.search_company_overview", new=AsyncMock(return_value=_TAVILY_RESULTS)),
        patch(f"{_SERVICE}.claude_service.call_claude", new=claude),
    ):
        yield search, claude


async def _create_company(as_user, user: dict) -> str:
    async with await as_user(user) as authed:
        resp = await authed.post("/companies", json={"name": "In Flight Corp", "primary_domain": "inflight.example.com"})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _other_run(company_id: str, user: dict) -> ResearchRunClaim:
    """Another request's run, claimed and still in flight."""
    claim = await company_research_service.claim_run(
        company_id=uuid.UUID(company_id), user_id=uuid.UUID(user["id"]),
    )
    assert claim is not None
    return claim


async def _claim_started_at(company_id: str) -> datetime | None:
    async with unit_of_work() as session:
        company = await session.get(Company, uuid.UUID(company_id))
        assert company is not None
        return company.research_started_at


class TestResearchRunClaim:
    @pytest.mark.asyncio
    async def test_second_claim_is_refused_until_the_first_is_released(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)

        first = await _other_run(company_id, user)
        with pytest.raises(ResearchAlreadyRunningError):
            await _other_run(company_id, user)

        await company_research_service.release_run(first)
        assert await _claim_started_at(company_id) is None
        await _other_run(company_id, user)

    @pytest.mark.asyncio
    async def test_another_company_is_not_blocked(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        await _other_run(await _create_company(as_user, user), user)

        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Other Corp"})
        await _other_run(resp.json()["id"], user)

    @pytest.mark.asyncio
    async def test_a_claim_older_than_the_lease_is_taken_over(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """A run that died with its process doesn't block the company for good."""
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        abandoned = datetime.now(timezone.utc) - COMPANY_RESEARCH_CLAIM_LEASE * 2
        async with unit_of_work() as session:
            await session.execute(
                update(Company).where(Company.id == uuid.UUID(company_id)).values(research_started_at=abandoned),
            )

        claim = await _other_run(company_id, user)

        assert claim.claimed_at > abandoned

    @pytest.mark.asyncio
    async def test_releasing_an_expired_claim_leaves_the_newer_one(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        newer = await _other_run(company_id, user)
        expired = ResearchRunClaim(
            company_id=newer.company_id,
            user_id=newer.user_id,
            company_name=newer.company_name,
            primary_domain=newer.primary_domain,
            claimed_at=newer.claimed_at - COMPANY_RESEARCH_CLAIM_LEASE * 2,
        )

        await company_research_service.release_run(expired)

        assert await _claim_started_at(company_id) == newer.claimed_at


class TestTriggerWhileRunning:
    @pytest.mark.asyncio
    async def test_refused_with_409_and_nothing_spent(self, user_factory, as_user) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        await _other_run(company_id, user)

        with _paid_calls() as (search, claude):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")
                research = await authed.get(f"/companies/{company_id}/research")

        assert resp.status_code == 409
        assert resp.json()["detail"] == "Research for this company is already running"
        search.assert_not_awaited()
        claude.assert_not_awaited()
        assert research.status_code == 404

    @pytest.mark.asyncio
    async def test_runs_once_the_other_run_has_finished(self, user_factory, as_user) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        await company_research_service.release_run(await _other_run(company_id, user))

        with _paid_calls() as (search, claude):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 200
        search.assert_awaited_once()
        claude.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unknown_company_is_404(self, user_factory, as_user) -> None:
        """The tenant check comes first: another user's id never answers 'already running'."""
        owner = await user_factory()
        company_id = await _create_company(as_user, owner)
        await _other_run(company_id, owner)
        stranger = await user_factory()

        with _paid_calls():
            async with await as_user(stranger) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 404


class TestClaimIsReleased:
    @pytest.mark.asyncio
    async def test_after_a_successful_run(self, user_factory, as_user) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)

        with _paid_calls():
            async with await as_user(user) as authed:
                first = await authed.post(f"/companies/{company_id}/research")
                again = await authed.post(f"/companies/{company_id}/research")

        assert (first.status_code, again.status_code) == (200, 200)
        assert await _claim_started_at(company_id) is None

    @pytest.mark.asyncio
    async def test_after_a_failed_run(self, user_factory, as_user) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)

        with _paid_calls() as (_search, claude):
            claude.side_effect = ValueError("unreadable reply")
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 502
        assert await _claim_started_at(company_id) is None

    @pytest.mark.asyncio
    async def test_when_the_user_is_over_quota(
        self, user_factory, as_user, one_run_budget: None,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)

        with _paid_calls():
            async with await as_user(user) as authed:
                ok = await authed.post(f"/companies/{company_id}/research")
                over = await authed.post(f"/companies/{company_id}/research")

        assert (ok.status_code, over.status_code) == (200, 429)
        assert await _claim_started_at(company_id) is None


class TestNoConnectionHeldDuringTheRun:
    @pytest.mark.asyncio
    async def test_search_and_ai_call_run_with_no_transaction_open(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Neither the request's session nor a service transaction is open while
        Tavily and Claude are waited on."""
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        seen: list[tuple[bool, int]] = []

        def _record() -> None:
            seen.append((db.in_transaction(), app_engine.pool.checkedout()))

        async def _search(**_: object) -> list[dict]:
            _record()
            return _TAVILY_RESULTS

        async def _claude(**_: object) -> dict:
            _record()
            return _CLAUDE_RESPONSE

        with _paid_calls() as (search, claude):
            search.side_effect = _search
            claude.side_effect = _claude
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 200
        assert seen == [(False, 0), (False, 0)]

    @pytest.mark.asyncio
    async def test_company_deleted_during_the_run_saves_nothing(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)

        async def _claude_while_company_is_deleted(**_: object) -> dict:
            async with await as_user(user) as other_tab:
                assert (await other_tab.delete(f"/companies/{company_id}")).status_code == 204
            return _CLAUDE_RESPONSE

        with _paid_calls() as (_search, claude):
            claude.side_effect = _claude_while_company_is_deleted
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")
                research = await authed.get(f"/companies/{company_id}/research")

        assert resp.status_code == 404
        assert research.status_code == 404


class TestRefusedRequestsSpendNoQuota:
    @pytest.mark.asyncio
    async def test_already_running_refusals_leave_the_quota_for_the_real_run(
        self, user_factory, as_user, one_run_budget: None,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        other = await _other_run(company_id, user)

        with _paid_calls() as (search, _claude):
            async with await as_user(user) as authed:
                refused = [(await authed.post(f"/companies/{company_id}/research")).status_code for _ in range(3)]
                await company_research_service.release_run(other)
                resp = await authed.post(f"/companies/{company_id}/research")

        assert refused == [409, 409, 409]
        assert resp.status_code == 200
        search.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unknown_company_answers_404_without_spending_quota(
        self, user_factory, as_user, one_run_budget: None,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)

        with _paid_calls():
            async with await as_user(user) as authed:
                missing = [(await authed.post(f"/companies/{uuid.uuid4()}/research")).status_code for _ in range(3)]
                resp = await authed.post(f"/companies/{company_id}/research")
                over = await authed.post(f"/companies/{company_id}/research")

        assert missing == [404, 404, 404]
        assert resp.status_code == 200
        assert over.status_code == 429


async def _take_over(company_id: str) -> datetime:
    """Another run claims the company (as it may once this run's lease has expired)."""
    newer = datetime.now(timezone.utc) + timedelta(minutes=1)
    async with unit_of_work() as session:
        await session.execute(
            update(Company).where(Company.id == uuid.UUID(company_id)).values(research_started_at=newer),
        )
    return newer


async def _research_row_exists(company_id: str) -> bool:
    async with unit_of_work() as session:
        return (await session.execute(
            select(CompanyResearch.id).where(CompanyResearch.company_id == uuid.UUID(company_id)),
        )).first() is not None


class TestTheClaimAcrossTheRun:
    @pytest.mark.asyncio
    async def test_the_lease_is_renewed_before_the_ai_call(self, user_factory, as_user) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        claim = await _other_run(company_id, user)
        during_claude: list[datetime | None] = []

        async def _claude(**_: object) -> dict:
            during_claude.append(await _claim_started_at(company_id))
            return _CLAUDE_RESPONSE

        with _paid_calls() as (_search, claude):
            claude.side_effect = _claude
            assert await company_research_service.run_claimed_research(claim) is not None

        assert during_claude[0] is not None and during_claude[0] > claim.claimed_at
        assert await _claim_started_at(company_id) is None

    @pytest.mark.asyncio
    async def test_taken_over_during_the_search_stops_before_the_ai_call(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        claim = await _other_run(company_id, user)
        newer: list[datetime] = []

        async def _search_while_taken_over(**_: object) -> list[dict]:
            newer.append(await _take_over(company_id))
            return _TAVILY_RESULTS

        with _paid_calls() as (search, claude):
            search.side_effect = _search_while_taken_over
            with pytest.raises(ResearchAlreadyRunningError):
                await company_research_service.run_claimed_research(claim)

        claude.assert_not_awaited()
        assert await _claim_started_at(company_id) == newer[0]

    @pytest.mark.asyncio
    async def test_taken_over_during_the_ai_call_saves_nothing_and_keeps_the_newer_claim(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        claim = await _other_run(company_id, user)
        newer: list[datetime] = []

        async def _claude_while_taken_over(**_: object) -> dict:
            newer.append(await _take_over(company_id))
            return _CLAUDE_RESPONSE

        with _paid_calls() as (_search, claude):
            claude.side_effect = _claude_while_taken_over
            with pytest.raises(ResearchAlreadyRunningError):
                await company_research_service.run_claimed_research(claim)

        assert not await _research_row_exists(company_id)
        assert await _claim_started_at(company_id) == newer[0]

    @pytest.mark.parametrize("cancel", ["task-cancel", "anyio-scope"])
    @pytest.mark.asyncio
    async def test_a_cancelled_run_still_releases_its_claim(
        self, user_factory, as_user, cancel: str,
    ) -> None:
        """A client disconnect cancels the request; the claim must not outlive it."""
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        claim = await _other_run(company_id, user)
        in_claude = asyncio.Event()

        async def _claude_forever(**_: object) -> dict:
            in_claude.set()
            await asyncio.Event().wait()
            return _CLAUDE_RESPONSE

        with _paid_calls() as (_search, claude):
            claude.side_effect = _claude_forever
            if cancel == "task-cancel":
                task = asyncio.create_task(company_research_service.run_claimed_research(claim))
                await in_claude.wait()
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            else:
                async with anyio.create_task_group() as group:
                    group.start_soon(company_research_service.run_claimed_research, claim)
                    await in_claude.wait()
                    group.cancel_scope.cancel()

        assert await _claim_started_at(company_id) is None

    @pytest.mark.asyncio
    async def test_a_failed_release_is_logged_and_does_not_hide_the_runs_error(
        self, user_factory, as_user, caplog: pytest.LogCaptureFixture,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        claim = await _other_run(company_id, user)

        with (
            _paid_calls() as (_search, claude),
            patch(
                f"{_SERVICE}.company_repository.release_research_claim",
                new=AsyncMock(side_effect=RuntimeError("database went away")),
            ),
            caplog.at_level(logging.ERROR, logger=_SERVICE),
        ):
            claude.side_effect = ValueError("Claude returned invalid JSON")
            with pytest.raises(ValueError, match="invalid JSON"):
                await company_research_service.run_claimed_research(claim)

        assert any(
            "Could not release the research claim" in r.getMessage() and r.exc_info
            for r in caplog.records
        )
