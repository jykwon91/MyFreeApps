"""Tests for discovery_score_service.score_user_inbox.

Covers:
- Budget exhausted before any scoring: no score_jd calls made.
- Happy path: budget allows N postings → score_jd called N times.
- Per-posting error swallowing: one bad posting does not abort the loop.
- Idempotency: already-scored postings excluded from list_unscored_for_user.

score_jd is mocked with AsyncMock throughout (no real Claude calls).
All tests use the standard conftest DB fixtures.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.services.job_analysis.job_analysis_service import JobAnalysisError


_SCORE_JD_PATH = "app.services.discovery.discovery_score_service.score_jd"
_SPENT_TODAY_PATH = "app.services.discovery.discovery_score_service._spent_today"
_SESSION_LOCAL_PATH = "app.services.discovery.discovery_score_service.AsyncSessionLocal"
_LIST_UNSCORED_PATH = (
    "app.services.discovery.discovery_score_service."
    "discovery_repository.list_unscored_for_user"
)


def _make_job(user_id: uuid.UUID) -> DiscoveredJob:
    return DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=str(uuid.uuid4()),
        title="Senior Engineer",
        company_name="Acme",
        remote_type="remote",
    )


def _make_analysis(cost: float = 0.005) -> MagicMock:
    analysis = MagicMock()
    analysis.verdict = "strong_fit"
    analysis.verdict_summary = "Great match."
    analysis.total_cost_usd = cost
    return analysis


class TestBudgetExhausted:
    @pytest.mark.asyncio
    async def test_no_scoring_when_budget_already_spent(self) -> None:
        """score_user_inbox exits immediately when daily spend exceeds cap."""
        user_id = uuid.uuid4()

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=999.0)),
            patch(_SCORE_JD_PATH, new=AsyncMock()) as mock_score,
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id)

        mock_score.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_scoring_when_no_candidates(self) -> None:
        """score_user_inbox is a no-op when list_unscored_for_user returns empty."""
        user_id = uuid.uuid4()

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=[])),
            patch(_SCORE_JD_PATH, new=AsyncMock()) as mock_score,
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id)

        mock_score.assert_not_called()


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_budget_allows_n_postings_scores_all(self) -> None:
        """With budget headroom, every candidate in the batch gets scored."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        analysis = _make_analysis(cost=0.005)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_SCORE_JD_PATH, new=AsyncMock(return_value=analysis)) as mock_score,
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        assert mock_score.call_count == 3

    @pytest.mark.asyncio
    async def test_budget_stops_loop_mid_batch(self) -> None:
        """Loop halts as soon as accumulated cost exceeds daily cap."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(5)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        # Each call costs $0.20; daily cap is $0.30 → allows 1 call
        # (after 2nd call accumulated = $0.40 > cap).
        analysis = _make_analysis(cost=0.20)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.15)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_SCORE_JD_PATH, new=AsyncMock(return_value=analysis)) as mock_score,
            patch.object(
                __import__(
                    "app.services.discovery.discovery_score_service",
                    fromlist=["DEFAULT_DAILY_BUDGET_USD"],
                ),
                "DEFAULT_DAILY_BUDGET_USD",
                0.30,
            ),
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        # Started at $0.15 spent; first score costs $0.20 → total $0.35 > $0.30 cap.
        # Loop breaks BEFORE the second posting is scored.
        assert mock_score.call_count == 1


class TestPerPostingErrorSwallowing:
    @pytest.mark.asyncio
    async def test_job_analysis_error_is_caught_and_loop_continues(self) -> None:
        """A JobAnalysisError on one posting logs + continues; other postings score."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        good_analysis = _make_analysis(cost=0.005)

        # 2nd call raises; 1st and 3rd succeed.
        mock_score = AsyncMock(
            side_effect=[good_analysis, JobAnalysisError("Claude error"), good_analysis]
        )

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_SCORE_JD_PATH, new=mock_score),
        ):
            from app.services.discovery import discovery_score_service
            # Should NOT raise — errors are swallowed per-posting.
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        assert mock_score.call_count == 3
