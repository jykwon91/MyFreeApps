"""Discovery scoring loop — runs after a fetch cycle to rate new postings.

After ``discovery_fetch_service.fetch_source`` upserts new rows, this
loop pulls the freshest unscored postings for the user, calls the
shared ``job_analysis_service.score()`` against the operator's profile
snapshot, and persists the score + reasoning back onto the
``discovered_jobs`` row.

Cost guard
==========

Each scoring call costs ~$0.005-$0.01 in Anthropic tokens. To bound
runaway cost we:

1. Cap how many postings we score per cycle (``DEFAULT_SCORE_BATCH``).
2. Aggregate today's spend from ``extraction_logs`` and stop the loop
   when it exceeds the per-user daily budget.
3. The hard ceiling lives in env (``DISCOVERY_DAILY_BUDGET_USD_HARD_CAP``,
   default $2.00). The per-user setting may not exceed this.

Error handling and circuit-breaker
===================================

Transient Anthropic errors (``rate_limit_error``, ``overloaded_error``,
``api_error``, ``connection_error``) are treated as per-row failures:

- Each failure increments the consecutive-failure counter.
- If three rows in a row fail, the loop aborts with a Sentry warning
  so the operator can diagnose from the dashboard alone, without grepping
  logs. Remaining rows stay with ``score IS NULL`` — the next scheduled
  pass picks them up.

Permanent Anthropic errors (``authentication_error``,
``invalid_request_error``) indicate a configuration bug — the loop
fails-loud immediately by re-raising, so a broken deploy doesn't
silently produce zero scores forever.

Non-Anthropic failures (validation errors, malformed JSON) are treated
as transient per-row failures (``retryable=True`` on JobAnalysisError
when ``code`` is None) so a single bad posting doesn't abort the batch.

Sentry tags emitted on every failure:

- ``discovery.score_error_type``  — Anthropic ``error.type`` or ``None``
- ``discovery.score_error_message`` — first 200 chars of the error message
- ``discovery.score_attempt_index`` — 0-based index of the failed posting

Async + isolated session
========================

Because this is invoked as a FastAPI ``BackgroundTask`` after the
/refresh response is sent, it runs WITHOUT the request's DB session.
We open a fresh ``AsyncSessionLocal`` here so DB work is owned by the
loop and cleaned up cleanly.

If the FastAPI process restarts mid-loop, unscored postings just stay
unscored. The next /refresh picks them up because
``list_unscored_for_user`` orders by ``discovered_at DESC`` and the
loop is idempotent (only writes ``score`` when it was previously NULL).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, time, timezone

import sentry_sdk
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.system.extraction_log import ExtractionLog
from app.repositories.discovery import discovery_repository
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    PERMANENT_ANTHROPIC_CODES,
    score as score_jd,
)

logger = logging.getLogger(__name__)


DEFAULT_SCORE_BATCH = 20
DEFAULT_DAILY_BUDGET_USD = 0.30

# Abort the scoring loop after this many consecutive failures so a
# sustained Anthropic outage doesn't waste the full batch budget and
# spams logs. Remaining rows stay unscored for the next pass.
_CIRCUIT_BREAKER_THRESHOLD = 3


async def score_user_inbox(user_id: uuid.UUID, *, batch: int = DEFAULT_SCORE_BATCH) -> None:
    """Score up to ``batch`` unscored postings for ``user_id``.

    Stops early when the per-user daily budget is exhausted. Per-row
    transient failures are logged + counted toward the circuit-breaker;
    one bad posting does not abort the rest of the batch unless three
    consecutive rows fail (circuit-breaker trips).

    Permanent config-bug errors (``authentication_error``,
    ``invalid_request_error``) are re-raised immediately — a deploy with
    a broken API key should fail loud, not silently produce zero scores.

    Designed to run as a FastAPI ``BackgroundTask`` after /refresh
    returns. No-op when there are no unscored postings or the budget
    is already spent.
    """
    daily_cap = _resolve_daily_budget()

    async with AsyncSessionLocal() as db:
        spent_today = await _spent_today(db, user_id)
        if spent_today >= daily_cap:
            logger.info(
                "discovery score: budget exhausted user=%s spent=%.4f cap=%.2f",
                user_id, spent_today, daily_cap,
            )
            return

        candidates = await discovery_repository.list_unscored_for_user(
            db, user_id, limit=batch,
        )
        if not candidates:
            return

        logger.info(
            "discovery score: starting user=%s candidates=%d budget_remaining=%.4f",
            user_id, len(candidates), daily_cap - spent_today,
        )

        # Track in-loop spend locally instead of re-querying
        # extraction_logs each iteration. ``score_jd`` returns the
        # JobAnalysis with ``total_cost_usd`` populated; sum into
        # ``spent_today`` so the next-iteration cap check is current
        # without an extra round-trip.
        scored = 0
        budget_hits = False
        consecutive_failures = 0
        last_failure_code: str | None = None

        for attempt_index, job in enumerate(candidates):
            if spent_today >= daily_cap:
                budget_hits = True
                break

            try:
                analysis = await score_jd(
                    db,
                    user_id,
                    jd_text=job.description or job.title,
                    source_url=job.source_url,
                    extracted_hint={
                        "title": job.title,
                        "company": job.company_name,
                        "location": job.location,
                    },
                    discovered_job_id=job.id,
                    discovered_job=job,
                )
            except JobAnalysisError as exc:
                _emit_sentry_failure(
                    exc=exc,
                    user_id=user_id,
                    job_id=job.id,
                    attempt_index=attempt_index,
                )

                # Permanent errors are config bugs — fail-loud so the operator
                # sees a crash on the next Sentry alert instead of a silent
                # zero-score inbox. The BackgroundTask runner will log the
                # exception; the current iteration's remaining rows stay
                # unscored for the next pass.
                if exc.code in PERMANENT_ANTHROPIC_CODES:
                    logger.error(
                        "discovery score: permanent error — aborting loop "
                        "user=%s job=%s code=%s err=%s",
                        user_id, job.id, exc.code, exc,
                    )
                    raise

                # Transient failure — count toward the circuit-breaker.
                consecutive_failures += 1
                last_failure_code = exc.code
                logger.warning(
                    "discovery score: transient failure user=%s job=%s "
                    "code=%s consecutive=%d err=%s",
                    user_id, job.id, exc.code, consecutive_failures, exc,
                )

                if consecutive_failures >= _CIRCUIT_BREAKER_THRESHOLD:
                    _emit_circuit_break_warning(
                        user_id=user_id,
                        consecutive=consecutive_failures,
                        last_code=last_failure_code,
                        attempt_index=attempt_index,
                    )
                    break

                continue

            # Successful score — reset the consecutive-failure counter.
            consecutive_failures = 0
            last_failure_code = None
            spent_today += float(analysis.total_cost_usd or 0)
            scored += 1

        logger.info(
            "discovery score: complete user=%s scored=%d budget_hit=%s spent_session=%.4f",
            user_id, scored, budget_hits, spent_today,
        )


def _emit_sentry_failure(
    *,
    exc: JobAnalysisError,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    attempt_index: int,
) -> None:
    """Capture a per-row scoring failure to Sentry with structured tags.

    Tags are specific enough to filter by error type in the Sentry dashboard
    without grepping logs — operators can diagnose a scoring outage from
    Sentry alone (per feedback_check_sentry_first.md).
    """
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("discovery.score_error_type", str(exc.code or "unknown"))
        scope.set_tag(
            "discovery.score_error_message",
            str(exc)[:200],
        )
        scope.set_tag("discovery.score_attempt_index", str(attempt_index))
        scope.set_tag("discovery.score_retryable", str(exc.retryable))
        scope.set_extra("user_id", str(user_id))
        scope.set_extra("job_id", str(job_id))
        sentry_sdk.capture_exception(exc)


def _emit_circuit_break_warning(
    *,
    user_id: uuid.UUID,
    consecutive: int,
    last_code: str | None,
    attempt_index: int,
) -> None:
    """Emit a Sentry warning event when the circuit-breaker trips.

    This is a separate event (not an exception) because the loop is aborting
    gracefully — remaining rows stay unscored for the next pass.  The warning
    is detectable in Sentry dashboards for alerting on sustained outages.
    """
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("discovery.circuit_break", "true")
        scope.set_tag("discovery.circuit_break_code", str(last_code or "unknown"))
        scope.set_tag("discovery.circuit_break_at_index", str(attempt_index))
        scope.set_extra("user_id", str(user_id))
        scope.set_extra("consecutive_failures", consecutive)
        sentry_sdk.capture_message(
            f"discovery score loop aborted: {consecutive} consecutive failures, "
            f"type={last_code or 'unknown'}",
            level="warning",
        )
    logger.warning(
        "discovery score: circuit breaker tripped user=%s "
        "consecutive=%d last_code=%s — remaining postings deferred to next pass",
        user_id, consecutive, last_code,
    )


def _resolve_daily_budget() -> float:
    """Read the per-user daily budget cap.

    For Phase C v1 we use a single env-driven cap for all users. Phase D
    will read a per-profile override clamped to this hard ceiling.
    """
    fallback = DEFAULT_DAILY_BUDGET_USD
    raw = getattr(settings, "discovery_daily_budget_usd", None)
    try:
        value = float(raw) if raw is not None else fallback
    except (TypeError, ValueError):
        value = fallback
    hard_cap_raw = getattr(settings, "discovery_daily_budget_usd_hard_cap", 2.0)
    try:
        hard_cap = float(hard_cap_raw)
    except (TypeError, ValueError):
        hard_cap = 2.0
    return min(value, hard_cap)


async def _spent_today(db: AsyncSession, user_id: uuid.UUID) -> float:
    """Sum cost_usd from extraction_logs for this user since midnight UTC."""
    today_start = datetime.combine(
        datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc,
    )
    stmt = select(func.coalesce(func.sum(ExtractionLog.cost_usd), 0)).where(
        ExtractionLog.user_id == user_id,
        ExtractionLog.created_at >= today_start,
    )
    result = await db.execute(stmt)
    return float(result.scalar_one() or 0)
