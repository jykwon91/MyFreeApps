"""Session orchestrator for the resume-refinement loop.

Public entry points (called from ``app.api.resume_refinement``):

- ``start_session`` — kick off a new session from a completed
  ``resume_upload_jobs`` row. Renders the parsed fields to markdown,
  runs the initial critique pass, and generates the first proposal.
- ``get_session_state`` — return the current session including pending
  proposal. Pure read.
- ``accept_pending`` — user accepts the AI proposal as-is.
- ``accept_custom`` — user supplies their own text instead.
- ``request_alternative`` — regenerate the proposal for the same target.
- ``skip_target`` — move to the next target without modifying.
- ``complete_session`` — terminal: mark the session done.

Each "advance" entry point has the same shape:
1. Apply the user's resolution to the draft (or skip).
2. Bump ``target_index`` (except for ``request_alternative``).
3. Append a turn row recording what just happened.
4. Generate the NEXT proposal (or mark complete if no targets remain).
5. Return the refreshed session.
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
from app.services.resume_refinement import critique_service, rewrite_service
from app.services.resume_refinement.errors import (
    NoMoreTargets,
    NoPendingProposal,
    SessionNotActive,
    SessionNotFound,
    SourceJobNotFound,
    SourceJobNotReady,
)
from app.services.resume_refinement.markdown_renderer import render_resume_to_markdown

logger = logging.getLogger(__name__)


async def start_session(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    source_resume_job_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Create a new session, run critique, and queue the first proposal."""
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
    # which only stores {"raw": "<Claude JSON string>"} and not the structured data.
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
    )

    # Run the critique pass. If it fails, the session still exists with
    # an empty improvement_targets — the caller can retry.
    try:
        critique = await critique_service.run_critique(
            resume_markdown=initial_draft,
            user_id=user_id,
            session_id=session.id,
        )
    except Exception as exc:
        logger.error(
            "Critique pass failed for session %s: %s", session.id, exc,
        )
        raise

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
        draft_after=initial_draft,
        tokens_in=critique["input_tokens"],
        tokens_out=critique["output_tokens"],
    )

    # Kick off the first rewrite proposal.
    session = await _generate_next_proposal(db, session, user_id=user_id, hint=None)
    return session


async def get_session_state(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    session = await session_repo.get_by_id_for_user(db, session_id, user_id)
    if session is None:
        raise SessionNotFound()
    return session


async def accept_pending(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Apply ``pending_proposal`` to the draft, advance, and queue the next."""
    session = await _load_active(db, session_id, user_id)
    if not session.pending_proposal:
        raise NoPendingProposal(
            "No pending AI proposal to accept. Request a new one or skip."
        )

    target = _current_target(session)
    new_draft = _apply_rewrite(
        session.current_draft,
        target_current_text=target["current_text"] if target else "",
        new_text=session.pending_proposal,
    )
    accepted_text = session.pending_proposal
    target_section = session.pending_target_section

    session = await session_repo.apply_user_resolution(
        db, session, new_draft=new_draft, advance_target=True,
    )
    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="user_accept",
        target_section=target_section,
        proposed_text=accepted_text,
        draft_after=new_draft,
    )

    return await _generate_next_proposal(db, session, user_id=user_id, hint=None)


async def accept_custom(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    user_text: str,
) -> ResumeRefinementSession:
    """Apply user-supplied text instead of the pending AI proposal."""
    session = await _load_active(db, session_id, user_id)
    target = _current_target(session)
    if target is None:
        raise NoMoreTargets()

    new_draft = _apply_rewrite(
        session.current_draft,
        target_current_text=target["current_text"],
        new_text=user_text,
    )
    target_section = session.pending_target_section or target.get("section")

    session = await session_repo.apply_user_resolution(
        db, session, new_draft=new_draft, advance_target=True,
    )
    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="user_custom",
        target_section=target_section,
        user_text=user_text,
        draft_after=new_draft,
    )

    return await _generate_next_proposal(db, session, user_id=user_id, hint=None)


async def request_alternative(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    hint: str | None,
) -> ResumeRefinementSession:
    """Regenerate the proposal for the same target without advancing."""
    session = await _load_active(db, session_id, user_id)
    target = _current_target(session)
    if target is None:
        raise NoMoreTargets()

    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="user_request_alternative",
        target_section=target.get("section"),
        user_text=hint,
    )
    session.turn_count += 1
    await db.flush()
    await db.commit()
    await db.refresh(session)

    return await _generate_next_proposal(db, session, user_id=user_id, hint=hint)


async def skip_target(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Skip the current target without modifying the draft."""
    session = await _load_active(db, session_id, user_id)
    target = _current_target(session)
    target_section = session.pending_target_section or (
        target.get("section") if target else None
    )

    session = await session_repo.apply_user_resolution(
        db, session, new_draft=session.current_draft, advance_target=True,
    )
    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="user_skip",
        target_section=target_section,
        draft_after=session.current_draft,
    )

    return await _generate_next_proposal(db, session, user_id=user_id, hint=None)


async def navigate(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    direction: str,
) -> ResumeRefinementSession:
    """Move the iteration cursor without consuming the active proposal.

    Lets the operator browse suggestions before committing to act on
    them. ``direction`` is ``"next"`` or ``"prev"`` — bounds-checked
    against ``len(improvement_targets)``. The previous pending
    proposal (if any) is cleared because it belonged to the previous
    target; a fresh proposal is generated for the new target.

    Raises:
        SessionNotFound / SessionNotActive: standard load failures.
        ValueError: ``direction`` is not "next" / "prev", OR the move
            would step out of bounds.
    """
    session = await _load_active(db, session_id, user_id)
    targets = session.improvement_targets or []
    if not targets:
        raise NoMoreTargets()

    if direction == "next":
        delta = 1
    elif direction == "prev":
        delta = -1
    else:
        raise ValueError(f"direction must be 'next' or 'prev', got {direction!r}")

    new_index = session.target_index + delta
    if new_index < 0:
        raise ValueError("Already at the first suggestion.")
    if new_index >= len(targets):
        raise ValueError("Already at the last suggestion.")

    session = await session_repo.set_target_index(db, session, new_index=new_index)
    return await _generate_next_proposal(db, session, user_id=user_id, hint=None)


async def complete_session(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Terminal: mark the session done. Locks the current_draft."""
    session = await _load_active(db, session_id, user_id)
    session = await session_repo.mark_completed(db, session)
    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="session_complete",
        draft_after=session.current_draft,
    )
    return session


# -----------------------------------------------------------------------------
# Internals
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
    - Education.start_year       → renderer["starts_on"] (year as string or "")
    - Education.end_year         → renderer["ends_on"]   (year as string or "")
    - Education.gpa (float)      → renderer["gpa"]       (string representation)

    ``headline`` is best-effort: we JSON-parse result_parsed_fields["raw"]
    and pull .headline if present; otherwise it's omitted (None falls through
    the ``if headline:`` guard in the renderer with no visible effect).
    """
    # Best-effort headline from the raw Claude JSON blob.
    headline: str | None = None
    raw_str = (raw_parsed or {}).get("raw")
    if raw_str:
        try:
            raw_obj = json.loads(raw_str)
            headline = raw_obj.get("headline") or None
        except (json.JSONDecodeError, AttributeError, TypeError):
            logger.debug(
                "result_parsed_fields['raw'] is not valid JSON — skipping headline."
            )

    work_history_dicts = [
        {
            "company": row.company_name,
            "title": row.title,
            "location": "",
            "starts_on": row.start_date.isoformat() if row.start_date else "",
            "ends_on": row.end_date.isoformat() if row.end_date else None,
            "is_current": row.end_date is None,
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


async def _load_active(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeRefinementSession:
    session = await session_repo.get_by_id_for_user(db, session_id, user_id)
    if session is None:
        raise SessionNotFound()
    if session.status != "active":
        raise SessionNotActive(
            f"Session is in status={session.status!r}; cannot modify."
        )
    return session


def _current_target(session: ResumeRefinementSession) -> dict | None:
    targets = session.improvement_targets or []
    if session.target_index >= len(targets):
        return None
    return targets[session.target_index]


async def _generate_next_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    user_id: uuid.UUID,
    hint: str | None,
) -> ResumeRefinementSession:
    """If a target remains, ask Claude for a proposal. Otherwise mark complete-ready.

    "Complete-ready" means the session has consumed all critique
    targets but the user hasn't explicitly clicked Done. We don't
    auto-complete — the user always presses the button. We just clear
    pending state.
    """
    target = _current_target(session)
    if target is None:
        # No more targets — clear pending state. The user clicks Complete to lock.
        session.pending_target_section = None
        session.pending_proposal = None
        session.pending_rationale = None
        session.pending_clarifying_question = None
        await db.flush()
        await db.commit()
        await db.refresh(session)
        return session

    try:
        rewrite = await rewrite_service.run_rewrite(
            resume_markdown=session.current_draft,
            target=target,
            hint=hint,
            user_id=user_id,
            session_id=session.id,
        )
    except Exception as exc:  # noqa: BLE001 — graceful-degrade for the iteration loop
        # Don't fail the user's action if Claude is flaky. Leave pending
        # state cleared; the frontend can show a retry affordance and
        # the user can request_alternative or skip to nudge generation.
        logger.error(
            "Rewrite generation failed for session %s target_index=%d: %s",
            session.id,
            session.target_index,
            exc,
        )
        return session

    session = await session_repo.update_pending_proposal(
        db,
        session,
        target_section=target.get("section"),
        proposal=rewrite["rewritten_text"] if rewrite["kind"] == "proposal" else None,
        rationale=rewrite["rationale"] if rewrite["kind"] == "proposal" else None,
        clarifying_question=rewrite["question"] if rewrite["kind"] == "clarify" else None,
        tokens_in=rewrite["input_tokens"],
        tokens_out=rewrite["output_tokens"],
        cost_usd=rewrite["cost_usd"],
    )

    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="ai_proposal",
        target_section=target.get("section"),
        proposed_text=session.pending_proposal,
        rationale=session.pending_rationale,
        clarifying_question=session.pending_clarifying_question,
        tokens_in=rewrite["input_tokens"],
        tokens_out=rewrite["output_tokens"],
    )

    return session


def _apply_rewrite(
    current_draft: str,
    *,
    target_current_text: str,
    new_text: str,
) -> str:
    """Apply a rewrite to the draft via verbatim substring replacement.

    The critique pass returns ``current_text`` verbatim from the source
    so a plain substring replace is safe AS LONG AS the user hasn't
    edited the draft elsewhere in a way that changed the target. We
    only replace the FIRST occurrence to avoid clobbering structurally
    similar bullets.

    If the substring is not found (rare — shouldn't happen in practice
    since the critique just ran on this exact draft), we append the new
    text to the end of the draft so the user's input isn't silently
    lost. The next critique pass would identify the duplication; this
    is the safer failure mode.
    """
    if not target_current_text:
        return f"{current_draft}\n\n{new_text}".strip()

    if target_current_text in current_draft:
        return current_draft.replace(target_current_text, new_text, 1)

    logger.warning(
        "Rewrite target not found in draft — appending. (target preview: %r)",
        target_current_text[:80],
    )
    return f"{current_draft}\n\n{new_text}".strip()
