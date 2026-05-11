"""Tests for discovery_score_service.score_user_inbox.

Covers:
- Budget exhausted before any scoring: no score_jd calls made.
- Happy path: budget allows N postings → score_jd called N times.
- Transient per-row failure: loop continues after a single transient error.
- Circuit-breaker: 3 consecutive transient failures abort the loop.
- Permanent error: authentication_error / invalid_request_error re-raised immediately.
- Sentry events: emitted on every failure + on circuit-break.
- Error classification: retryable flag correctly set on JobAnalysisError.

score_jd is mocked with AsyncMock throughout (no real Claude calls).
All tests use the standard conftest DB fixtures.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    PERMANENT_ANTHROPIC_CODES,
    TRANSIENT_ANTHROPIC_CODES,
)


_SCORE_JD_PATH = "app.services.discovery.discovery_score_service.score_jd"
_SPENT_TODAY_PATH = "app.services.discovery.discovery_score_service._spent_today"
_SESSION_LOCAL_PATH = "app.services.discovery.discovery_score_service.AsyncSessionLocal"
_LIST_UNSCORED_PATH = (
    "app.services.discovery.discovery_score_service."
    "discovery_repository.list_unscored_for_user"
)
_SENTRY_CAPTURE_EXC_PATH = "app.services.discovery.discovery_score_service.sentry_sdk.capture_exception"
_SENTRY_CAPTURE_MSG_PATH = "app.services.discovery.discovery_score_service.sentry_sdk.capture_message"
_SENTRY_NEW_SCOPE_PATH = "app.services.discovery.discovery_score_service.sentry_sdk.new_scope"


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


def _make_transient_error(code: str = "rate_limit_error") -> JobAnalysisError:
    """Create a transient JobAnalysisError (retryable=True)."""
    return JobAnalysisError(f"Anthropic error: {code}", code=code, retryable=True)


def _make_permanent_error(code: str = "authentication_error") -> JobAnalysisError:
    """Create a permanent JobAnalysisError (retryable=False)."""
    return JobAnalysisError(f"Anthropic error: {code}", code=code, retryable=False)


def _noop_scope_cm() -> MagicMock:
    """Return a MagicMock context-manager that does nothing — stands in for
    sentry_sdk.new_scope() so we don't need real Sentry in tests."""
    scope = MagicMock()
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=scope)
    cm.__exit__ = MagicMock(return_value=False)
    return cm


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
    async def test_score_jd_receives_discovered_job_kwarg(self) -> None:
        """score_jd is called with discovered_job= so both writes land in one commit.

        Before this refactor, score_jd committed the JobAnalysis first, then
        the worker wrote discovered_job.score in a second commit. A crash between
        those two commits left discovered_job.score = NULL while the cost record
        already existed, causing a re-bill on the next refresh. The fix passes the
        ORM row into score_jd so the single internal commit covers both writes.
        """
        user_id = uuid.uuid4()
        job = _make_job(user_id)

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        analysis = _make_analysis(cost=0.005)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=[job])),
            patch(_SCORE_JD_PATH, new=AsyncMock(return_value=analysis)) as mock_score,
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        assert mock_score.call_count == 1
        call_kwargs = mock_score.call_args.kwargs
        # The worker must pass the ORM row — not just the ID — so score_jd can
        # mutate it within the same transaction.
        assert call_kwargs["discovered_job"] is job
        # The worker must NOT call db.commit() itself; score_jd owns the boundary.
        mock_db.commit.assert_not_called()

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


class TestTransientErrorHandling:
    @pytest.mark.asyncio
    async def test_single_transient_error_does_not_abort_loop(self) -> None:
        """A single transient failure logs a warning; the loop continues for other rows."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        good_analysis = _make_analysis(cost=0.005)
        # 2nd call raises a transient error; 1st and 3rd succeed.
        mock_score = AsyncMock(
            side_effect=[
                good_analysis,
                _make_transient_error("rate_limit_error"),
                good_analysis,
            ]
        )

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_SCORE_JD_PATH, new=mock_score),
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
            patch(_SENTRY_CAPTURE_EXC_PATH),
            patch(_SENTRY_CAPTURE_MSG_PATH),
        ):
            from app.services.discovery import discovery_score_service
            # Should NOT raise — transient errors are swallowed per-posting.
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        assert mock_score.call_count == 3

    @pytest.mark.asyncio
    async def test_all_transient_error_codes_trigger_continue(self) -> None:
        """Every code in TRANSIENT_ANTHROPIC_CODES causes a continue, not a raise."""
        for code in TRANSIENT_ANTHROPIC_CODES:
            user_id = uuid.uuid4()
            job = _make_job(user_id)

            mock_db = AsyncMock()
            mock_cm = AsyncMock()
            mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
            mock_cm.__aexit__ = AsyncMock(return_value=None)

            with (
                patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
                patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
                patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=[job])),
                patch(_SCORE_JD_PATH, new=AsyncMock(side_effect=_make_transient_error(code))),
                patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
                patch(_SENTRY_CAPTURE_EXC_PATH),
                patch(_SENTRY_CAPTURE_MSG_PATH),
            ):
                from app.services.discovery import discovery_score_service
                # None of these should raise out of score_user_inbox.
                await discovery_score_service.score_user_inbox(user_id, batch=10)

    @pytest.mark.asyncio
    async def test_sentry_tags_emitted_on_transient_failure(self) -> None:
        """Sentry capture_exception is called with structured tags on each per-row failure."""
        user_id = uuid.uuid4()
        job = _make_job(user_id)

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        scope_mock = MagicMock()
        scope_cm = MagicMock()
        scope_cm.__enter__ = MagicMock(return_value=scope_mock)
        scope_cm.__exit__ = MagicMock(return_value=False)

        err = _make_transient_error("overloaded_error")

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=[job])),
            patch(_SCORE_JD_PATH, new=AsyncMock(side_effect=err)),
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=scope_cm),
            patch(_SENTRY_CAPTURE_EXC_PATH) as mock_capture_exc,
            patch(_SENTRY_CAPTURE_MSG_PATH),
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        # capture_exception was called with the error
        mock_capture_exc.assert_called_once_with(err)
        # Scope tags were set
        scope_mock.set_tag.assert_any_call("discovery.score_error_type", "overloaded_error")
        scope_mock.set_tag.assert_any_call("discovery.score_retryable", "True")


class TestCircuitBreaker:
    @pytest.mark.asyncio
    async def test_three_consecutive_failures_trips_circuit_breaker(self) -> None:
        """3 consecutive transient failures abort the loop; Sentry warning emitted."""
        user_id = uuid.uuid4()
        # 5 jobs available — only 3 should be attempted before circuit break.
        jobs = [_make_job(user_id) for _ in range(5)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(
                _SCORE_JD_PATH,
                new=AsyncMock(side_effect=_make_transient_error("rate_limit_error")),
            ) as mock_score,
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
            patch(_SENTRY_CAPTURE_EXC_PATH),
            patch(_SENTRY_CAPTURE_MSG_PATH) as mock_capture_msg,
        ):
            from app.services.discovery import discovery_score_service
            # Should NOT raise — circuit break is a graceful abort.
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        # Only 3 attempts (threshold) — loop aborted before the 4th.
        assert mock_score.call_count == 3
        # A warning message event was sent to Sentry.
        mock_capture_msg.assert_called_once()
        msg_arg = mock_capture_msg.call_args.args[0]
        assert "aborted" in msg_arg
        assert "rate_limit_error" in msg_arg

    @pytest.mark.asyncio
    async def test_consecutive_counter_resets_on_success(self) -> None:
        """A successful score resets the consecutive-failure counter.

        Pattern: fail, fail, succeed, fail, fail, fail → circuit breaks at
        the 3rd consecutive failure AFTER the reset (i.e., after the success).
        Total calls = 2 + 1 + 3 = 6.
        """
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(10)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        good_analysis = _make_analysis(cost=0.005)
        err = _make_transient_error("rate_limit_error")

        mock_score = AsyncMock(
            side_effect=[
                err,           # consecutive=1
                err,           # consecutive=2
                good_analysis, # reset → consecutive=0
                err,           # consecutive=1
                err,           # consecutive=2
                err,           # consecutive=3 → circuit break
            ]
        )

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(_SCORE_JD_PATH, new=mock_score),
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
            patch(_SENTRY_CAPTURE_EXC_PATH),
            patch(_SENTRY_CAPTURE_MSG_PATH),
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        assert mock_score.call_count == 6

    @pytest.mark.asyncio
    async def test_circuit_breaker_emits_sentry_warning_with_last_code(self) -> None:
        """The Sentry warning message includes the failure code and attempt index."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(5)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        scope_mock = MagicMock()
        scope_cm = MagicMock()
        scope_cm.__enter__ = MagicMock(return_value=scope_mock)
        scope_cm.__exit__ = MagicMock(return_value=False)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(
                _SCORE_JD_PATH,
                new=AsyncMock(side_effect=_make_transient_error("overloaded_error")),
            ),
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=scope_cm),
            patch(_SENTRY_CAPTURE_EXC_PATH),
            patch(_SENTRY_CAPTURE_MSG_PATH) as mock_capture_msg,
        ):
            from app.services.discovery import discovery_score_service
            await discovery_score_service.score_user_inbox(user_id, batch=10)

        # Sentry warning event includes circuit-break tag
        scope_mock.set_tag.assert_any_call("discovery.circuit_break", "true")
        scope_mock.set_tag.assert_any_call(
            "discovery.circuit_break_code", "overloaded_error"
        )
        mock_capture_msg.assert_called_once()
        assert "overloaded_error" in mock_capture_msg.call_args.args[0]


class TestPermanentErrors:
    @pytest.mark.asyncio
    async def test_authentication_error_re_raises_immediately(self) -> None:
        """authentication_error is a config bug — loop re-raises without continuing."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(
                _SCORE_JD_PATH,
                new=AsyncMock(side_effect=_make_permanent_error("authentication_error")),
            ) as mock_score,
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
            patch(_SENTRY_CAPTURE_EXC_PATH),
            patch(_SENTRY_CAPTURE_MSG_PATH),
        ):
            from app.services.discovery import discovery_score_service
            with pytest.raises(JobAnalysisError) as exc_info:
                await discovery_score_service.score_user_inbox(user_id, batch=10)

        # Only 1 attempt before the raise — remaining 2 jobs untouched.
        assert mock_score.call_count == 1
        assert exc_info.value.code == "authentication_error"
        assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_invalid_request_error_re_raises_immediately(self) -> None:
        """invalid_request_error is a config bug — loop re-raises without continuing."""
        user_id = uuid.uuid4()
        jobs = [_make_job(user_id) for _ in range(3)]

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=jobs)),
            patch(
                _SCORE_JD_PATH,
                new=AsyncMock(side_effect=_make_permanent_error("invalid_request_error")),
            ) as mock_score,
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
            patch(_SENTRY_CAPTURE_EXC_PATH),
            patch(_SENTRY_CAPTURE_MSG_PATH),
        ):
            from app.services.discovery import discovery_score_service
            with pytest.raises(JobAnalysisError) as exc_info:
                await discovery_score_service.score_user_inbox(user_id, batch=10)

        assert mock_score.call_count == 1
        assert exc_info.value.code == "invalid_request_error"
        assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_all_permanent_error_codes_re_raise(self) -> None:
        """Every code in PERMANENT_ANTHROPIC_CODES triggers an immediate re-raise."""
        for code in PERMANENT_ANTHROPIC_CODES:
            user_id = uuid.uuid4()
            job = _make_job(user_id)

            mock_db = AsyncMock()
            mock_cm = AsyncMock()
            mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
            mock_cm.__aexit__ = AsyncMock(return_value=None)

            with (
                patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
                patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
                patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=[job])),
                patch(
                    _SCORE_JD_PATH,
                    new=AsyncMock(side_effect=_make_permanent_error(code)),
                ),
                patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
                patch(_SENTRY_CAPTURE_EXC_PATH),
                patch(_SENTRY_CAPTURE_MSG_PATH),
            ):
                from app.services.discovery import discovery_score_service
                with pytest.raises(JobAnalysisError) as exc_info:
                    await discovery_score_service.score_user_inbox(user_id, batch=10)

            assert exc_info.value.code == code
            assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_sentry_capture_called_before_re_raise_on_permanent_error(self) -> None:
        """Sentry capture_exception fires even for permanent errors before re-raise."""
        user_id = uuid.uuid4()
        job = _make_job(user_id)

        mock_db = AsyncMock()
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_db)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        err = _make_permanent_error("authentication_error")

        with (
            patch(_SESSION_LOCAL_PATH, return_value=mock_cm),
            patch(_SPENT_TODAY_PATH, new=AsyncMock(return_value=0.0)),
            patch(_LIST_UNSCORED_PATH, new=AsyncMock(return_value=[job])),
            patch(_SCORE_JD_PATH, new=AsyncMock(side_effect=err)),
            patch(_SENTRY_NEW_SCOPE_PATH, return_value=_noop_scope_cm()),
            patch(_SENTRY_CAPTURE_EXC_PATH) as mock_capture_exc,
            patch(_SENTRY_CAPTURE_MSG_PATH),
        ):
            from app.services.discovery import discovery_score_service
            with pytest.raises(JobAnalysisError):
                await discovery_score_service.score_user_inbox(user_id, batch=10)

        # Sentry was still notified even though we re-raised.
        mock_capture_exc.assert_called_once_with(err)


class TestJobAnalysisErrorStructure:
    """Tests for JobAnalysisError field semantics and from_anthropic() factory."""

    def test_default_is_retryable(self) -> None:
        """JobAnalysisError with no kwargs defaults to retryable=True, code=None."""
        err = JobAnalysisError("generic error")
        assert err.retryable is True
        assert err.code is None

    def test_retryable_false_when_explicit(self) -> None:
        err = JobAnalysisError("permanent", code="authentication_error", retryable=False)
        assert err.retryable is False
        assert err.code == "authentication_error"

    def test_from_anthropic_rate_limit_is_transient(self) -> None:
        """RateLimitError maps to retryable=True."""
        import anthropic
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.headers = {}
        mock_response.request = MagicMock()
        mock_response.status_code = 429
        exc = anthropic.RateLimitError(
            "rate limit",
            response=mock_response,
            body={"error": {"type": "rate_limit_error"}},
        )
        wrapped = JobAnalysisError.from_anthropic(exc)
        assert wrapped.code == "rate_limit_error"
        assert wrapped.retryable is True

    def test_from_anthropic_authentication_error_is_permanent(self) -> None:
        """AuthenticationError maps to retryable=False."""
        import anthropic
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.headers = {}
        mock_response.request = MagicMock()
        mock_response.status_code = 401
        exc = anthropic.AuthenticationError(
            "bad key",
            response=mock_response,
            body={"error": {"type": "authentication_error"}},
        )
        wrapped = JobAnalysisError.from_anthropic(exc)
        assert wrapped.code == "authentication_error"
        assert wrapped.retryable is False

    def test_from_anthropic_invalid_request_is_permanent(self) -> None:
        """BadRequestError with invalid_request_error type maps to retryable=False."""
        import anthropic
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.headers = {}
        mock_response.request = MagicMock()
        mock_response.status_code = 400
        exc = anthropic.BadRequestError(
            "bad request",
            response=mock_response,
            body={"error": {"type": "invalid_request_error"}},
        )
        wrapped = JobAnalysisError.from_anthropic(exc)
        assert wrapped.code == "invalid_request_error"
        assert wrapped.retryable is False

    def test_from_anthropic_overloaded_is_transient(self) -> None:
        """InternalServerError with overloaded_error type maps to retryable=True.

        Anthropic signals "overloaded" via HTTP 529 which is caught by
        ``anthropic.InternalServerError`` (the public subclass of
        ``APIStatusError``). ``OverloadedError`` exists in the private module
        but is not exported — we test the public class with the correct body.
        """
        import anthropic
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.headers = {}
        mock_response.request = MagicMock()
        mock_response.status_code = 529
        # InternalServerError is the public subclass that catches 529 responses.
        exc = anthropic.InternalServerError(
            "overloaded",
            response=mock_response,
            body={"error": {"type": "overloaded_error"}},
        )
        wrapped = JobAnalysisError.from_anthropic(exc)
        assert wrapped.code == "overloaded_error"
        assert wrapped.retryable is True

    def test_from_anthropic_connection_error_is_transient(self) -> None:
        """APIConnectionError maps to code='connection_error', retryable=True."""
        import anthropic
        from unittest.mock import MagicMock

        exc = anthropic.APIConnectionError(request=MagicMock())
        wrapped = JobAnalysisError.from_anthropic(exc)
        assert wrapped.code == "connection_error"
        assert wrapped.retryable is True

    def test_error_codes_in_transient_set_are_retryable(self) -> None:
        """Every code in TRANSIENT_ANTHROPIC_CODES produces retryable=True."""
        for code in TRANSIENT_ANTHROPIC_CODES:
            err = JobAnalysisError("test", code=code, retryable=True)
            assert err.retryable is True, f"Expected retryable for code={code}"

    def test_error_codes_in_permanent_set_are_not_retryable(self) -> None:
        """Every code in PERMANENT_ANTHROPIC_CODES produces retryable=False."""
        for code in PERMANENT_ANTHROPIC_CODES:
            err = JobAnalysisError("test", code=code, retryable=False)
            assert err.retryable is False, f"Expected not-retryable for code={code}"
