"""Data-access layer for resume_refinement_sessions.

Every read/write is tenant-scoped on ``user_id`` — callers must never
omit it. Service-layer helpers live in
``app.services.resume_refinement.session_service`` and orchestrate the
critique + rewrite loop on top of these primitives.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.resume_refinement.session import ResumeRefinementSession

_RECENT_LIMIT = 25


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source_resume_job_id: uuid.UUID | None,
    initial_draft: str,
    status: str = "active",
) -> ResumeRefinementSession:
    """Insert a new session and return the persisted row."""
    session = ResumeRefinementSession(
        user_id=user_id,
        source_resume_job_id=source_resume_job_id,
        current_draft=initial_draft,
        status=status,
    )
    db.add(session)
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def get_by_id_for_user(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeRefinementSession | None:
    """Return a session scoped to the given user, or None."""
    result = await db.execute(
        select(ResumeRefinementSession).where(
            ResumeRefinementSession.id == session_id,
            ResumeRefinementSession.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_with_turns_for_user(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeRefinementSession | None:
    """Return a session with its turns eagerly loaded."""
    result = await db.execute(
        select(ResumeRefinementSession)
        .options(selectinload(ResumeRefinementSession.turns))
        .where(
            ResumeRefinementSession.id == session_id,
            ResumeRefinementSession.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_recent_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[ResumeRefinementSession]:
    """Return up to 25 sessions for the user, newest first."""
    result = await db.execute(
        select(ResumeRefinementSession)
        .where(ResumeRefinementSession.user_id == user_id)
        .order_by(ResumeRefinementSession.created_at.desc())
        .limit(_RECENT_LIMIT)
    )
    return list(result.scalars().all())


async def get_active_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> ResumeRefinementSession | None:
    """Return the user's most recent active session, or None."""
    result = await db.execute(
        select(ResumeRefinementSession)
        .where(
            ResumeRefinementSession.user_id == user_id,
            ResumeRefinementSession.status == "active",
        )
        .order_by(ResumeRefinementSession.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_critique(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    improvement_targets: list[dict],
    tokens_in: int,
    tokens_out: int,
    cost_usd: Decimal,
) -> ResumeRefinementSession:
    """Persist the initial critique pass output."""
    session.improvement_targets = improvement_targets
    session.target_index = 0
    session.turn_count += 1
    session.total_tokens_in += tokens_in
    session.total_tokens_out += tokens_out
    session.total_cost_usd = (session.total_cost_usd or Decimal("0")) + cost_usd
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def update_pending_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_section: str | None,
    proposal: str | None,
    rationale: str | None,
    clarifying_question: str | None,
    tokens_in: int,
    tokens_out: int,
    cost_usd: Decimal,
    guard_flagged: list[str] | None = None,
    flagged_proposal: str | None = None,
) -> ResumeRefinementSession:
    """Set the pending AI proposal on the session and bump counters.

    ``guard_flagged`` / ``flagged_proposal`` carry the hallucination-guard
    state when the proposal was downgraded to a clarify — kept so a
    clarify answer can confirm the phrases and "Use it anyway" can apply
    the held text.
    """
    session.pending_target_section = target_section
    session.pending_proposal = proposal
    session.pending_rationale = rationale
    session.pending_clarifying_question = clarifying_question
    session.pending_guard_flagged = guard_flagged
    session.pending_flagged_proposal = flagged_proposal
    session.turn_count += 1
    session.total_tokens_in += tokens_in
    session.total_tokens_out += tokens_out
    session.total_cost_usd = (session.total_cost_usd or Decimal("0")) + cost_usd
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def apply_user_resolution(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    new_draft: str,
    advance_target: bool,
) -> ResumeRefinementSession:
    """Clear pending state, persist the new draft, optionally bump target_index."""
    session.current_draft = new_draft
    session.pending_target_section = None
    session.pending_proposal = None
    session.pending_rationale = None
    session.pending_clarifying_question = None
    session.pending_guard_flagged = None
    session.pending_flagged_proposal = None
    if advance_target:
        session.target_index += 1
    session.turn_count += 1
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def set_target_index(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    new_index: int,
) -> ResumeRefinementSession:
    """Move the iteration cursor without modifying the draft.

    Used by the navigation entry point so the operator can browse
    suggestions without committing to act on each one. Pending
    proposal state is cleared (the previous proposal was for the
    previous target); the caller may choose to regenerate immediately.
    Does NOT bump ``turn_count`` — navigation isn't a content change.
    """
    session.target_index = new_index
    session.pending_target_section = None
    session.pending_proposal = None
    session.pending_rationale = None
    session.pending_clarifying_question = None
    session.pending_guard_flagged = None
    session.pending_flagged_proposal = None
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def hydrate_pending_from_cache(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
) -> ResumeRefinementSession | None:
    """If a cached proposal exists for ``target_index``, copy it onto
    the pending_* fields and return the refreshed session. Returns
    ``None`` when there's no cache entry — callers should fall through
    to generation.
    """
    cache = session.proposal_cache or {}
    entry = cache.get(str(target_index))
    if not entry:
        return None
    session.pending_target_section = entry.get("section")
    session.pending_proposal = entry.get("proposal")
    session.pending_rationale = entry.get("rationale")
    session.pending_clarifying_question = entry.get("clarifying_question")
    session.pending_guard_flagged = entry.get("guard_flagged")
    session.pending_flagged_proposal = entry.get("flagged_proposal")
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def cache_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
    target_section: str | None,
    proposal: str | None,
    rationale: str | None,
    clarifying_question: str | None,
    guard_flagged: list[str] | None = None,
    flagged_proposal: str | None = None,
) -> ResumeRefinementSession:
    """Write the just-generated proposal into ``proposal_cache`` for
    the given ``target_index`` so future navigations skip the AI call.

    JSONB requires a fresh dict assignment for SQLAlchemy to detect
    the change — mutating in place doesn't flush.
    """
    existing = dict(session.proposal_cache or {})
    existing[str(target_index)] = {
        "section": target_section,
        "proposal": proposal,
        "rationale": rationale,
        "clarifying_question": clarifying_question,
        "guard_flagged": guard_flagged,
        "flagged_proposal": flagged_proposal,
    }
    session.proposal_cache = existing
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def invalidate_cached_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
) -> ResumeRefinementSession:
    """Drop the cached proposal for ``target_index`` (used by
    ``request_alternative`` so the next ``cache_proposal`` write is
    the regenerated value).
    """
    existing = dict(session.proposal_cache or {})
    if str(target_index) in existing:
        del existing[str(target_index)]
        session.proposal_cache = existing
        await db.flush()
        await db.commit()
        await db.refresh(session)
    return session


async def mark_completed(
    db: AsyncSession,
    session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """Mark the session ``completed`` and stamp ``completed_at``."""
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    session.pending_target_section = None
    session.pending_proposal = None
    session.pending_rationale = None
    session.pending_clarifying_question = None
    session.pending_guard_flagged = None
    session.pending_flagged_proposal = None
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def add_confirmed_facts(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    facts: list[str],
) -> ResumeRefinementSession:
    """Append user-confirmed facts to the session-level allowlist.

    Deduplicates case-insensitively while preserving insertion order.
    JSONB requires a fresh list assignment for SQLAlchemy to detect the
    change — mutating in place doesn't flush.
    """
    existing = list(session.confirmed_facts or [])
    seen = {f.strip().lower() for f in existing}
    for fact in facts:
        cleaned = (fact or "").strip()
        if cleaned and cleaned.lower() not in seen:
            existing.append(cleaned)
            seen.add(cleaned.lower())
    session.confirmed_facts = existing
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def claim_next_preparing(db: AsyncSession) -> ResumeRefinementSession | None:
    """Atomically claim one unclaimed ``preparing`` session and return it.

    Mirrors ``resume_upload_job_repo.claim_next_queued``: an
    ``UPDATE ... WHERE id = (subquery) RETURNING`` with
    ``FOR UPDATE SKIP LOCKED`` so only one worker replica can claim a
    given session. The claim marker is ``preparation_started_at``
    (status stays ``preparing`` — the frontend keeps showing the
    progress card either way).

    Returns ``None`` when nothing is waiting.
    """
    now = datetime.now(timezone.utc)
    subq = (
        select(ResumeRefinementSession.id)
        .where(
            ResumeRefinementSession.status == "preparing",
            ResumeRefinementSession.preparation_started_at.is_(None),
        )
        .order_by(ResumeRefinementSession.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    stmt = (
        update(ResumeRefinementSession)
        .where(ResumeRefinementSession.id == subq)
        .values(preparation_started_at=now, updated_at=now)
        .returning(ResumeRefinementSession)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        await db.commit()
    return row


async def mark_active(
    db: AsyncSession,
    session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """Unlock a prepared session for user mutations."""
    session.status = "active"
    session.error_message = None
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def mark_preparation_failed(
    db: AsyncSession,
    session: ResumeRefinementSession,
    error_message: str,
) -> ResumeRefinementSession:
    """Permanent preparation failure — surfaced as the "Try again" card."""
    session.status = "failed"
    session.error_message = error_message
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def release_preparation_claim(
    db: AsyncSession,
    session: ResumeRefinementSession,
    note: str,
) -> ResumeRefinementSession:
    """Transient preparation failure — release the claim so the next
    worker poll retries. Status stays ``preparing``."""
    session.preparation_started_at = None
    session.error_message = note
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def reset_for_retry(
    db: AsyncSession,
    session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """User-initiated retry of a ``failed`` preparation: re-queue it."""
    session.status = "preparing"
    session.error_message = None
    session.preparation_started_at = None
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def increment_guard_flag_count(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
) -> ResumeRefinementSession:
    """Bump the per-target hallucination-guard flag counter."""
    counts = dict(session.guard_flag_counts or {})
    key = str(target_index)
    counts[key] = int(counts.get(key, 0)) + 1
    session.guard_flag_counts = counts
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def mark_abandoned(
    db: AsyncSession,
    session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """Mark the session ``abandoned`` (user explicitly walked away)."""
    session.status = "abandoned"
    session.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session
