"""A company's research can't be run twice at once.

Each run is a paid Tavily search plus a Claude call, 10-30 s long. Leaving the
company and coming back (or a second tab or device) used to start a second run
of the same company while the first was in flight. The server now claims the
run with a Postgres advisory lock, so the second request is refused with 409
before anything is spent.

The test client shares one session across requests, and an advisory lock is
re-entrant within a session, so the "other run" holds its lock on a second
session of its own.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.api import companies
from app.core.rate_limit import RateLimiter
from app.repositories.company import company_research_repository

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


@pytest_asyncio.fixture
async def other_session(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """A second connection, standing in for another request's run."""
    session = async_sessionmaker(db_engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        await session.close()


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


class TestResearchRunLock:
    @pytest.mark.asyncio
    async def test_second_claim_is_refused_until_the_first_transaction_ends(
        self, db: AsyncSession, other_session: AsyncSession,
    ) -> None:
        company_id = uuid.uuid4()

        assert await company_research_repository.try_lock_run(other_session, company_id) is True
        assert await company_research_repository.try_lock_run(db, company_id) is False
        await db.rollback()

        await other_session.rollback()
        assert await company_research_repository.try_lock_run(db, company_id) is True
        await db.rollback()

    @pytest.mark.asyncio
    async def test_another_company_is_not_blocked(
        self, db: AsyncSession, other_session: AsyncSession,
    ) -> None:
        assert await company_research_repository.try_lock_run(other_session, uuid.uuid4()) is True
        assert await company_research_repository.try_lock_run(db, uuid.uuid4()) is True
        await db.rollback()


class TestTriggerWhileRunning:
    @pytest.mark.asyncio
    async def test_refused_with_409_and_nothing_spent(
        self, user_factory, as_user, other_session: AsyncSession,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        assert await company_research_repository.try_lock_run(other_session, uuid.UUID(company_id)) is True

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
    async def test_runs_once_the_other_run_has_finished(
        self, user_factory, as_user, other_session: AsyncSession,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        assert await company_research_repository.try_lock_run(other_session, uuid.UUID(company_id)) is True
        await other_session.commit()

        with _paid_calls() as (search, claude):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 200
        search.assert_awaited_once()
        claude.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unknown_company_is_still_404_while_locked(
        self, user_factory, as_user, other_session: AsyncSession,
    ) -> None:
        """The tenant check comes first: another user's id never answers 'already running'."""
        user = await user_factory()
        missing = uuid.uuid4()
        assert await company_research_repository.try_lock_run(other_session, missing) is True

        with _paid_calls():
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{missing}/research")

        assert resp.status_code == 404


class TestRefusedRequestsSpendNoQuota:
    @pytest.mark.asyncio
    async def test_already_running_refusals_leave_the_quota_for_the_real_run(
        self, user_factory, as_user, other_session: AsyncSession, one_run_budget: None,
    ) -> None:
        user = await user_factory()
        company_id = await _create_company(as_user, user)
        assert await company_research_repository.try_lock_run(other_session, uuid.UUID(company_id)) is True

        with _paid_calls() as (search, _claude):
            async with await as_user(user) as authed:
                refused = [(await authed.post(f"/companies/{company_id}/research")).status_code for _ in range(3)]
                await other_session.rollback()
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
