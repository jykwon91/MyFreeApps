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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.system.extraction_log import ExtractionLog
from app.repositories.discovery import discovery_repository
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    score as score_jd,
)

logger = logging.getLogger(__name__)


DEFAULT_SCORE_BATCH = 20
DEFAULT_DAILY_BUDGET_USD = 0.30


async def score_user_inbox(user_id: uuid.UUID, *, batch: int = DEFAULT_SCORE_BATCH) -> None:
    """Score up to ``batch`` unscored postings for ``user_id``.

    Stops early when the per-user daily budget is exhausted. Per-call
    failures are logged + swallowed; one bad posting does not abort the
    rest of the batch.

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

        for job in candidates:
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
                )
            except JobAnalysisError as exc:
                logger.warning(
                    "discovery score: failed user=%s job=%s err=%s",
                    user_id, job.id, exc,
                )
                continue

            # ``score_jd`` already committed the JobAnalysis row + the
            # extraction_logs entry. Mutate the discovered_job and
            # commit once more; this is a separate transaction (cheap)
            # but the prior commit means the cost is already recorded
            # so a crash here doesn't lose accounting — only loses the
            # ``score`` pointer, which the next refresh re-discovers
            # via list_unscored_for_user. Idempotent on retry: the
            # JobAnalysis exists, score_jd is called again, second
            # JobAnalysis row is created, only the latest links via
            # discovered_job.score.
            #
            # Future improvement: thread the discovered_job mutation
            # INTO score_jd so both writes share one commit. Larger
            # refactor — flagged in TECH_DEBT.md.
            score_int = _verdict_to_score(analysis.verdict)
            job.score = score_int
            job.score_reason = (analysis.verdict_summary or "")[:1000]
            job.scored_at = datetime.now(timezone.utc)
            await db.commit()

            spent_today += float(analysis.total_cost_usd or 0)
            scored += 1

        logger.info(
            "discovery score: complete user=%s scored=%d budget_hit=%s spent_session=%.4f",
            user_id, scored, budget_hits, spent_today,
        )


def _verdict_to_score(verdict: str) -> int:
    """Collapse the JD-analysis verdict into a 0-100 sort key."""
    return {
        "strong_fit": 90,
        "worth_considering": 70,
        "stretch": 40,
        "mismatch": 15,
    }.get(verdict, 50)


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
