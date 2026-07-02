"""Session turn / mutation entry points for the resume-refinement loop.

Public entry points (called from ``app.api.resume_refinement``):

- ``accept_pending`` — user accepts the AI proposal as-is.
- ``accept_flagged`` — user applies a guard-held proposal after explicitly
  confirming the flagged facts are accurate ("Use it anyway").
- ``accept_custom`` — user supplies their own text instead.
- ``request_alternative`` — regenerate the proposal for the same target.
- ``skip_target`` — move to the next target without modifying.
- ``navigate`` — move the iteration cursor without consuming the active proposal.

Each "advance" entry point has the same shape:
1. Apply the user's resolution to the draft (or skip).
2. Bump ``target_index`` (except for ``request_alternative``).
3. Append a turn row recording what just happened.
4. Generate the NEXT proposal (or mark complete if no targets remain).
5. Return the refreshed session.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.resume_refinement import session_repo, turn_repo
from app.services.resume_refinement.errors import (
    NoMoreTargets,
    NoPendingProposal,
)
from app.services.resume_refinement.session_helpers import (
    _apply_rewrite,
    _current_target,
    _generate_next_proposal,
    _load_active,
    _with_turns,
)


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

    session = await _generate_next_proposal(db, session, user_id=user_id, hint=None)
    return await _with_turns(db, session)


async def accept_flagged(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Apply a guard-held proposal after explicit user confirmation.

    The "Use it anyway — I confirm this is accurate" escape from the
    clarify loop: the flagged phrases become session-level confirmed
    facts (so they never re-flag), and the held proposal is applied to
    the draft exactly like a normal accept.
    """
    session = await _load_active(db, session_id, user_id)
    if not session.pending_flagged_proposal:
        raise NoPendingProposal(
            "No guard-held proposal to apply. Request a new suggestion instead."
        )

    flagged_facts = list(session.pending_guard_flagged or [])
    if flagged_facts:
        session = await session_repo.add_confirmed_facts(
            db, session, facts=flagged_facts,
        )

    target = _current_target(session)
    new_draft = _apply_rewrite(
        session.current_draft,
        target_current_text=target["current_text"] if target else "",
        new_text=session.pending_flagged_proposal,
    )
    accepted_text = session.pending_flagged_proposal
    target_section = session.pending_target_section

    session = await session_repo.apply_user_resolution(
        db, session, new_draft=new_draft, advance_target=True,
    )
    await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="user_accept_flagged",
        target_section=target_section,
        proposed_text=accepted_text,
        draft_after=new_draft,
    )

    session = await _generate_next_proposal(db, session, user_id=user_id, hint=None)
    return await _with_turns(db, session)


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

    session = await _generate_next_proposal(db, session, user_id=user_id, hint=None)
    return await _with_turns(db, session)


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

    # When the pending clarify was guard-generated and the user typed an
    # answer, record the flagged phrases as session-level confirmed
    # facts BEFORE regenerating. The regenerated proposal is checked
    # against the allowlist, so "yes, that's correct" actually unblocks
    # — previously the same phrase re-flagged against the unchanged
    # source and the identical question returned forever.
    flagged_facts = list(session.pending_guard_flagged or [])
    if hint and hint.strip() and flagged_facts:
        session = await session_repo.add_confirmed_facts(
            db, session, facts=flagged_facts,
        )

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

    # Drop the cached proposal so this regeneration's output replaces
    # the stale one. Without invalidation, a future navigate-back to
    # this target would surface the OLD proposal even though the
    # operator explicitly asked for a fresh take.
    session = await session_repo.invalidate_cached_proposal(
        db, session, target_index=session.target_index,
    )

    session = await _generate_next_proposal(db, session, user_id=user_id, hint=hint)
    return await _with_turns(db, session)


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

    session = await _generate_next_proposal(db, session, user_id=user_id, hint=None)
    return await _with_turns(db, session)


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

    # Cache hit: hydrate the pending_* fields from the previously
    # generated proposal for this target. No Anthropic round-trip,
    # so navigation is instant. The operator can still force a
    # regeneration via ``request_alternative`` ("Another option").
    cached = await session_repo.hydrate_pending_from_cache(
        db, session, target_index=new_index,
    )
    if cached is not None:
        return await _with_turns(db, cached)

    # Cache miss: fall through to generation. ``_generate_next_proposal``
    # writes the result back to the cache for future navigations.
    session = await _generate_next_proposal(db, session, user_id=user_id, hint=None)
    return await _with_turns(db, session)
