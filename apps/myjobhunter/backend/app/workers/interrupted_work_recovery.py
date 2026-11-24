"""Put back work the resume worker was killed in the middle of.

A resume parse claims its job (``processing``) and a refinement prepare claims
its session (``preparation_started_at``); both release the claim only when the
step ends. A step killed mid-way (a deploy past ``stop_grace_period``, a crash,
an OOM kill) leaves the claim in place, and nothing claims a claimed row again,
so the user's upload or suggestions would spin forever.

Run once at worker boot, before polling. Every claim found then was made by a
worker that is gone: one worker container runs, and compose stops the old one
before starting the new one. Each interrupted step counts as an attempt, so a
row that keeps killing the worker (say, out of memory) ends ``failed`` after
the usual retry limit instead of looping.

This relies on that single worker. A second replica booting would re-queue a
sibling's live claims: a parse's later writes check their claim and are
dropped, but a prepare re-reads its claim after being picked up, so the two
runs could both prepare the same session. Scaling the worker out needs a
claim heartbeat in the row instead of boot-time recovery.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from platform_shared.core.audit_actor import audit_actor

from app.core.job_failure_messages import (
    INTERRUPTED_RETRY_MESSAGE,
    REFINEMENT_PREP_FAILED_MESSAGE,
    RESUME_PARSE_FAILED_MESSAGE,
)
from app.core.refinement_prepare_constants import REFINEMENT_PREP_MAX_RETRIES
from app.core.resume_parse_constants import RESUME_PARSE_MAX_RETRIES
from app.db.session import AsyncSessionLocal
from app.repositories.jobs import resume_upload_job_repo
from app.repositories.resume_refinement import session_repo

logger = logging.getLogger(__name__)


async def recover_interrupted_work() -> None:
    """Re-queue (or, past the retry limit, fail) every claimed parse and prepare."""
    await _recover_resume_jobs()
    await _recover_preparations()


async def _recover_resume_jobs() -> None:
    async with AsyncSessionLocal() as db:
        claims = [
            (job.id, job.user_id, job.started_at)
            for job in await resume_upload_job_repo.list_processing(db)
        ]
    for job_id, user_id, started_at in claims:
        with audit_actor(user_id):
            async with AsyncSessionLocal() as db:
                job = await resume_upload_job_repo.get_claimed_for_update(
                    db, job_id, user_id, started_at=started_at,
                )
                if job is None:
                    continue
                if job.retry_count < RESUME_PARSE_MAX_RETRIES:
                    await resume_upload_job_repo.schedule_retry(
                        db,
                        job,
                        next_retry_at=datetime.now(timezone.utc),
                        error_message=INTERRUPTED_RETRY_MESSAGE,
                    )
                    logger.warning("Resume job %s was interrupted; re-queued", job_id)
                else:
                    await resume_upload_job_repo.mark_failed(
                        db, job, RESUME_PARSE_FAILED_MESSAGE,
                    )
                    logger.warning(
                        "Resume job %s was interrupted past its retry limit; failed", job_id,
                    )


async def _recover_preparations() -> None:
    async with AsyncSessionLocal() as db:
        claims = [
            (session.id, session.user_id, session.preparation_started_at)
            for session in await session_repo.list_claimed_preparations(db)
        ]
    for session_id, user_id, claimed_at in claims:
        with audit_actor(user_id):
            async with AsyncSessionLocal() as db:
                session = await session_repo.get_claimed_preparation_for_update(
                    db, session_id, user_id, claimed_at=claimed_at,
                )
                if session is None:
                    continue
                if session.preparation_retry_count < REFINEMENT_PREP_MAX_RETRIES:
                    await session_repo.release_preparation_claim(
                        db,
                        session,
                        INTERRUPTED_RETRY_MESSAGE,
                        next_retry_at=datetime.now(timezone.utc),
                    )
                    logger.warning(
                        "Refinement session %s was interrupted mid-prepare; re-queued", session_id,
                    )
                else:
                    await session_repo.mark_preparation_failed(
                        db, session, REFINEMENT_PREP_FAILED_MESSAGE,
                    )
                    logger.warning(
                        "Refinement session %s was interrupted past its retry limit; failed",
                        session_id,
                    )
