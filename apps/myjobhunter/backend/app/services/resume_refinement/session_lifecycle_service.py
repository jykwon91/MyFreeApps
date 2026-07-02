"""Session lifecycle entry points for the resume-refinement loop.

Public entry points (called from ``app.api.resume_refinement``):

- ``start_session`` — create a ``preparing`` session from a completed
  ``resume_upload_jobs`` row and return in well under a second. The
  initial draft renders inline (profile-table read, no Claude call);
  the expensive critique + prefetch run in the background worker.
- ``retry_preparation`` — re-queue a ``failed`` preparation.
- ``get_session_state`` — return the current session including pending
  proposal. Pure read.
- ``complete_session`` — terminal: mark the session done.

Worker-side entry point (called from
``app.workers.refinement_prepare_worker`` after an atomic claim):

- ``prepare_session`` — critique → prefetch → hydrate first target →
  unlock (status ``active``). Idempotent on retry.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.education import Education
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.jobs import resume_upload_job_repo
from app.repositories.profile import (
    education_repository,
    profile_repository,
    skill_repository,
    work_history_repository,
)
from app.repositories.resume_refinement import session_repo, turn_repo
from app.services.resume_refinement import critique_service
from app.services.resume_refinement.errors import (
    PreparationFailed,
    SessionNotActive,
    SessionNotFound,
    SourceJobNotFound,
    SourceJobNotReady,
)
from app.services.resume_refinement.markdown_renderer import render_resume_to_markdown
from app.services.resume_refinement.session_helpers import (
    _generate_next_proposal,
    _prefetch_all_proposals,
    _with_turns,
)

logger = logging.getLogger(__name__)


async def start_session(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    source_resume_job_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Create a ``preparing`` session and return immediately.

    Rendering the initial draft from profile tables is a cheap DB read,
    so it happens inline — the frontend shows the draft right away. The
    critique pass and the all-targets prefetch (1-2 minutes of Claude
    calls) run in the background worker; the session unlocks
    (status ``active``) when the first proposal is ready. This used to
    be one synchronous request, which meant a dead button spinner for
    the whole wait and a fragile 90s+ request vs the 2-minute Caddy
    timeouts.
    """
    job = await resume_upload_job_repo.get_by_id_for_user(
        db, source_resume_job_id, user_id,
    )
    if job is None:
        raise SourceJobNotFound(
            f"resume_upload_job {source_resume_job_id} not found for user."
        )
    if job.status != "complete":
        raise SourceJobNotReady(
            f"resume_upload_job is in status={job.status!r}; must be 'complete'."
        )

    # Build the initial draft from profile tables — NOT from result_parsed_fields,
    # which only stores the raw Claude blob and not the structured data.
    profile = await profile_repository.get_by_user_id(db, user_id)
    work_history_rows = await work_history_repository.list_by_user(db, user_id)
    education_rows = await education_repository.list_by_user(db, user_id)
    skill_rows = await skill_repository.list_by_user(db, user_id)

    renderer_input = _build_renderer_input(
        profile=profile,
        work_history_rows=work_history_rows,
        education_rows=education_rows,
        skill_rows=skill_rows,
        raw_parsed=job.result_parsed_fields,
    )
    initial_draft = render_resume_to_markdown(renderer_input)

    session = await session_repo.create(
        db,
        user_id=user_id,
        source_resume_job_id=source_resume_job_id,
        initial_draft=initial_draft,
        status="preparing",
    )
    return await _with_turns(db, session)


async def prepare_session(
    *,
    db: AsyncSession,
    session: ResumeRefinementSession,
    user_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Run the expensive preparation for a claimed ``preparing`` session.

    Called from the background worker. Idempotent on retry: the critique
    pass is skipped when ``improvement_targets`` is already populated (a
    previous attempt got that far), so a retry after a prefetch-stage
    failure doesn't re-spend the critique call.

    Raises on failure — the worker decides transient (release the claim,
    poll retries) vs permanent (status ``failed`` + error_message).
    """
    if session.improvement_targets is None:
        critique = await critique_service.run_critique(
            resume_markdown=session.current_draft,
            user_id=user_id,
            session_id=session.id,
        )
        session = await session_repo.update_critique(
            db,
            session,
            improvement_targets=critique["targets"],
            tokens_in=critique["input_tokens"],
            tokens_out=critique["output_tokens"],
            cost_usd=critique["cost_usd"],
        )
        await turn_repo.append(
            db,
            session_id=session.id,
            turn_index=0,
            role="ai_critique",
            target_section=None,
            rationale=f"Identified {len(critique['targets'])} improvement targets.",
            draft_after=session.current_draft,
            tokens_in=critique["input_tokens"],
            tokens_out=critique["output_tokens"],
        )

    targets = session.improvement_targets or []
    if not targets:
        # Nothing to draft — unlock straight into the "nothing to flag"
        # completion state. Waiting for a "first proposal" here would
        # spin forever (there is no target 0).
        return await session_repo.mark_active(db, session)

    # Prefetch proposals for ALL critique targets in parallel. The
    # operator's stated workflow is to browse every suggestion before
    # acting, so we pay the Claude cost up front to make navigation
    # instant. Per-target failures are graceful — those targets
    # generate on first visit.
    session = await _prefetch_all_proposals(db, session, user_id=user_id)

    # Hydrate pending_* from the cache for the starting target. If the
    # prefetch for target 0 failed, fall back to a synchronous
    # generation.
    hydrated = await session_repo.hydrate_pending_from_cache(
        db, session, target_index=session.target_index,
    )
    if hydrated is not None:
        session = hydrated
    else:
        session = await _generate_next_proposal(
            db, session, user_id=user_id, hint=None,
        )

    # Unlock gate: never flip to active without real content for the
    # current target. GET /sessions/{id} is a pure read (no
    # generate-on-poll), so unlocking early would strand the user on a
    # permanently-stuck "working on a suggestion" placeholder.
    if not (session.pending_proposal or session.pending_clarifying_question):
        raise PreparationFailed(
            "Suggestion generation failed for the first target."
        )

    return await session_repo.mark_active(db, session)


async def retry_preparation(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Re-queue a ``failed`` background preparation (frontend "Try again").

    The critique output survives the failure, so a retry after a
    prefetch-stage failure resumes from the prefetch (see
    ``prepare_session`` idempotency note).
    """
    session = await session_repo.get_by_id_for_user(db, session_id, user_id)
    if session is None:
        raise SessionNotFound()
    if session.status != "failed":
        raise SessionNotActive(
            f"Session is in status={session.status!r}; only failed "
            "preparations can be retried."
        )
    session = await session_repo.reset_for_retry(db, session)
    return await _with_turns(db, session)


async def get_session_state(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    session = await session_repo.get_with_turns_for_user(db, session_id, user_id)
    if session is None:
        raise SessionNotFound()
    return session


async def complete_session(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Terminal: mark the session done. Locks the current_draft."""
    from app.services.resume_refinement.session_helpers import _load_active
    session = await _load_active(db, session_id, user_id)
    session = await session_repo.mark_completed(db, session)
    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="session_complete",
        draft_after=session.current_draft,
    )
    return await _with_turns(db, session)


# -----------------------------------------------------------------------------
# Lifecycle-only helpers
# -----------------------------------------------------------------------------


def _build_renderer_input(
    *,
    profile: Profile | None,
    work_history_rows: list[WorkHistory],
    education_rows: list[Education],
    skill_rows: list[Skill],
    raw_parsed: dict[str, Any] | None,
) -> dict[str, Any]:
    """Adapter: project profile-table ORM rows into the dict shape that
    ``render_resume_to_markdown`` expects.

    The renderer was originally designed to consume Claude's parsed JSON
    directly, which uses different field names from our ORM models:

    - WorkHistory.company_name   → renderer["company"]
    - WorkHistory.start_date     → renderer["starts_on"] (ISO date string or "")
    - WorkHistory.end_date       → renderer["ends_on"]   (ISO date string or None)
    - WorkHistory.is_current     → renderer["is_current"] (drives "Present")
    - Education.start_year       → renderer["starts_on"] (year as string or "")
    - Education.end_year         → renderer["ends_on"]   (year as string or "")
    - Education.gpa (float)      → renderer["gpa"]       (string representation)

    ``headline`` is best-effort: result_parsed_fields["raw"] holds the Claude
    response as a dict (the worker stores it unserialized); legacy rows may
    hold a JSON string instead, so both shapes are accepted. On any other
    shape the headline is omitted (None falls through the ``if headline:``
    guard in the renderer with no visible effect).
    """
    # Best-effort headline from the raw Claude blob (dict, or legacy JSON string).
    headline: str | None = None
    raw_val = (raw_parsed or {}).get("raw")
    raw_obj: Any = raw_val
    if isinstance(raw_val, str) and raw_val:
        try:
            raw_obj = json.loads(raw_val)
        except json.JSONDecodeError:
            logger.debug(
                "result_parsed_fields['raw'] is not valid JSON — skipping headline."
            )
            raw_obj = None
    if isinstance(raw_obj, dict):
        headline = raw_obj.get("headline") or None

    work_history_dicts = [
        {
            "company": row.company_name,
            "title": row.title,
            "location": "",
            "starts_on": row.start_date.isoformat() if row.start_date else "",
            "ends_on": row.end_date.isoformat() if row.end_date else None,
            "is_current": bool(row.is_current),
            "bullets": list(row.bullets or []),
        }
        for row in work_history_rows
    ]

    education_dicts = [
        {
            "school": row.school,
            "degree": row.degree or "",
            "field": row.field or "",
            "starts_on": str(row.start_year) if row.start_year else "",
            "ends_on": str(row.end_year) if row.end_year else "",
            "gpa": str(row.gpa) if row.gpa is not None else "",
        }
        for row in education_rows
    ]

    skill_dicts = [
        {
            "name": row.name,
            "category": row.category or "other",
        }
        for row in skill_rows
    ]

    result: dict[str, Any] = {
        "summary": (profile.summary or "").strip() if profile else "",
        "headline": headline,
        "work_history": work_history_dicts,
        "education": education_dicts,
        "skills": skill_dicts,
    }
    return result
