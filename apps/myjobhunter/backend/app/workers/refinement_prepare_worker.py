"""Refinement-session preparation — one step of the worker polling loop.

Runs inside the SAME worker process as the resume parser (see
``resume_parser_worker.main``), so no new container or compose change
is needed. Each poll:

1. Atomically claim one ``preparing`` session whose
   ``preparation_started_at`` is NULL (UPDATE ... RETURNING with
   FOR UPDATE SKIP LOCKED — safe across worker replicas).
2. Run ``session_lifecycle_service.prepare_session``: critique →
   prefetch every target proposal → hydrate the first target →
   unlock (status ``active``).
3. On transient failure (rate limit, network, Claude 5xx): release the
   claim so the next poll retries. On permanent failure: mark the
   session ``failed`` with ``error_message`` — the frontend shows a
   "Try again" card wired to POST /sessions/{id}/retry-preparation.

The frontend's existing 3s poll on GET /sessions/{id} observes the
status flips and the growing ``proposal_cache``, driving the staged
progress card ("Reviewing your resume" → "Drafting suggestions k/N" →
unlock).
"""
from __future__ import annotations

import logging

from app.db.session import AsyncSessionLocal
from app.repositories.resume_refinement import session_repo
from app.services.resume_refinement import session_lifecycle_service
from app.workers.resume_parser_worker import _is_transient

logger = logging.getLogger(__name__)


async def process_one_session() -> bool:
    """Claim and prepare one ``preparing`` session.

    Returns True if a session was found, False if nothing is waiting.
    """
    async with AsyncSessionLocal() as db:
        claimed = await session_repo.claim_next_preparing(db)
        if claimed is None:
            return False
        session_id = claimed.id
        user_id = claimed.user_id

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
    except Exception as exc:  # noqa: BLE001 — worker loop must not die
        error_msg = str(exc)[:1000]
        logger.exception(
            "Failed to prepare refinement session %s: %s", session_id, error_msg,
        )
        async with AsyncSessionLocal() as db:
            session = await session_repo.get_by_id_for_user(
                db, session_id, user_id,
            )
            if session is not None and session.status == "preparing":
                if _is_transient(exc):
                    await session_repo.release_preparation_claim(
                        db,
                        session,
                        f"Transient error — will retry: {error_msg}",
                    )
                else:
                    await session_repo.mark_preparation_failed(
                        db, session, error_msg,
                    )

    return True
