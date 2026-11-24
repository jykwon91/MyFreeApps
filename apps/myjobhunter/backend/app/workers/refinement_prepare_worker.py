"""Refinement-session preparation — one step of the worker polling loop.

Runs inside the SAME worker process as the resume parser (see
``resume_parser_worker.poll_until_stopped``), so no new container or compose
change is needed. Each poll:

1. Claim one ``preparing`` session whose ``preparation_started_at`` is
   NULL (read FOR UPDATE SKIP LOCKED, then stamped in the same
   transaction — safe across worker replicas).
2. Run ``session_lifecycle_service.prepare_session``: critique →
   prefetch every target proposal → hydrate the first target →
   unlock (status ``active``).
3. On transient failure (the shared ``ExtractionError.kind``: rate limit,
   overloaded, timeout/connection, Claude 5xx): release the claim with a
   growing wait, up to ``REFINEMENT_PREP_MAX_RETRIES``. On permanent
   failure, or once retries run out: mark the session ``failed`` with
   ``error_message`` (our own copy) — the frontend shows a
   "Try again" card wired to POST /sessions/{id}/retry-preparation.

The frontend's existing 3s poll on GET /sessions/{id} observes the
status flips and the growing ``proposal_cache``, driving the staged
progress card ("Reviewing your resume" → "Drafting suggestions k/N" →
unlock).
"""
from __future__ import annotations

import logging

from platform_shared.core.audit_actor import audit_actor
from platform_shared.extraction import is_transient_failure

from app.core.ai_failure_messages import AI_RETRY_SCHEDULED_MESSAGE
from app.core.job_failure_messages import REFINEMENT_PREP_FAILED_MESSAGE
from app.core.refinement_prepare_constants import (
    REFINEMENT_PREP_MAX_RETRIES,
    REFINEMENT_PREP_RETRY_BASE_SECONDS,
)
from app.core.retry_backoff import next_retry_at
from app.core.transient_errors import TRANSIENT_WORKER_ERRORS
from app.db.session import AsyncSessionLocal
from app.repositories.resume_refinement import session_repo
from app.services.extraction.ai_failure import user_failure_message
from app.services.resume_refinement import session_lifecycle_service
from app.services.resume_refinement.errors import SessionNotFound

logger = logging.getLogger(__name__)


async def process_one_session() -> bool:
    """Claim and prepare one ``preparing`` session.

    Returns True if a session was found, False if nothing is waiting. The
    claim and every audited write after it are recorded as made by the
    session's user.
    """
    async with AsyncSessionLocal() as db:
        due = await session_repo.lock_next_due_preparation(db)
        if due is None:
            return False
        with audit_actor(due.user_id):
            claimed = await session_repo.mark_preparation_started(db, due)
        session_id = claimed.id
        user_id = claimed.user_id
        claimed_at = claimed.preparation_started_at

    with audit_actor(user_id):
        logger.info(
            "Preparing refinement session %s for user %s", session_id, user_id,
        )

        try:
            async with AsyncSessionLocal() as db:
                # Re-fetch in a fresh session (the claim session is closed).
                session = await session_repo.get_by_id_for_user(
                    db, session_id, user_id,
                )
                if session is None or session.status != "preparing":
                    logger.warning(
                        "Session %s vanished or changed status before "
                        "preparation — skipping",
                        session_id,
                    )
                    return True
                await session_lifecycle_service.prepare_session(
                    db=db, session=session, user_id=user_id,
                )
            logger.info("Prepared refinement session %s", session_id)
        except SessionNotFound:
            logger.info("Refinement session %s was deleted during preparation", session_id)
        except Exception as exc:  # noqa: BLE001 — worker loop must not die
            logger.exception("Failed to prepare refinement session %s", session_id)
            # Stored as our own copy, never the exception's (or provider's) text.
            error_msg = user_failure_message(exc, fallback=REFINEMENT_PREP_FAILED_MESSAGE)
            async with AsyncSessionLocal() as db:
                session = await session_repo.get_by_id_for_user(
                    db, session_id, user_id,
                )
                # Only while this run still holds the claim: a session that was
                # claimed again meanwhile belongs to the newer run.
                if (
                    session is not None
                    and session.status == "preparing"
                    and session.preparation_started_at == claimed_at
                ):
                    if (
                        is_transient_failure(exc, extra_transient=TRANSIENT_WORKER_ERRORS)
                        and session.preparation_retry_count < REFINEMENT_PREP_MAX_RETRIES
                    ):
                        await session_repo.release_preparation_claim(
                            db,
                            session,
                            AI_RETRY_SCHEDULED_MESSAGE,
                            next_retry_at=next_retry_at(
                                session.preparation_retry_count,
                                REFINEMENT_PREP_RETRY_BASE_SECONDS,
                            ),
                        )
                    else:
                        await session_repo.mark_preparation_failed(
                            db, session, error_msg,
                        )

    return True
