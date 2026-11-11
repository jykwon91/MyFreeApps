"""Repository helpers for a session's per-target ``proposal_cache``.

Sibling module to ``session_repo.py`` (which sits over the 500-LOC growth
guard); ``session_repo`` re-exports these names so callers keep using
``session_repo.<name>``. Same conventions: mutate the ORM row, reassign
fresh containers for JSONB change detection, flush + commit + refresh.

Each cache entry records what it was generated against, so the service
can tell whether it is still valid for the current session state:

- ``target_text`` / ``draft_occurrences`` — the target's source text and
  how many times it appears in ``current_draft`` at generation time.
- ``context_marker`` — newest turn index feeding ``prior_context`` at
  generation time (see ``session_helpers._prior_context_marker``).
- ``confirmed_facts_count`` — how many facts the user had confirmed; a
  guard-flagged entry is stale once that changes.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession


async def _persist(
    db: AsyncSession, session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


def _load_entry_into_pending(
    session: ResumeRefinementSession,
    entry: dict[str, Any],
    *,
    target_index: int,
) -> None:
    """Copy ``entry`` onto the pending_* fields.

    Showing a guard-flagged entry is what makes the flag count: prefetch
    flags the user never saw must not read as a repeat when the proposal
    is later regenerated, so the counter is floored at 1 on first display.
    Revisiting the same entry leaves it at 1.
    """
    session.pending_target_section = entry.get("section")
    session.pending_proposal = entry.get("proposal")
    session.pending_rationale = entry.get("rationale")
    session.pending_clarifying_question = entry.get("clarifying_question")
    session.pending_guard_flagged = entry.get("guard_flagged")
    session.pending_flagged_proposal = entry.get("flagged_proposal")
    if entry.get("guard_flagged"):
        counts = dict(session.guard_flag_counts or {})
        key = str(target_index)
        if int(counts.get(key, 0)) < 1:
            counts[key] = 1
            session.guard_flag_counts = counts


async def hydrate_pending_from_cache(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
) -> ResumeRefinementSession | None:
    """If a cached proposal exists for ``target_index``, copy it onto
    the pending_* fields and return the refreshed session. Returns
    ``None`` when there's no cache entry — callers should fall through
    to generation. Does not judge validity; the service does that first.
    """
    entry = (session.proposal_cache or {}).get(str(target_index))
    if not entry:
        return None
    _load_entry_into_pending(session, entry, target_index=target_index)
    return await _persist(db, session)


async def apply_cached_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
    entry: dict[str, Any],
) -> ResumeRefinementSession:
    """Serve a cached ``entry`` as the next proposal: set every pending
    field and bump ``turn_count`` by exactly 1, in a single commit.

    The bumped ``turn_count`` is the index of the ``ai_proposal`` turn the
    caller appends next, mirroring ``update_pending_proposal``. No tokens
    or cost are added — that spend was recorded when the entry was made.
    """
    _load_entry_into_pending(session, entry, target_index=target_index)
    session.turn_count += 1
    return await _persist(db, session)


async def cache_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
    target_section: str | None,
    target_text: str | None,
    context_marker: int,
    proposal: str | None,
    rationale: str | None,
    clarifying_question: str | None,
    guard_flagged: list[str] | None = None,
    flagged_proposal: str | None = None,
) -> ResumeRefinementSession:
    """Write a generated proposal into ``proposal_cache`` for
    ``target_index`` so future navigations and advances skip the AI call.

    ``draft_occurrences`` and ``confirmed_facts_count`` are read from the
    session as it is right now. JSONB requires a fresh dict assignment
    for SQLAlchemy to detect the change — mutating in place doesn't flush.
    """
    existing = dict(session.proposal_cache or {})
    existing[str(target_index)] = {
        "section": target_section,
        "proposal": proposal,
        "rationale": rationale,
        "clarifying_question": clarifying_question,
        "guard_flagged": guard_flagged,
        "flagged_proposal": flagged_proposal,
        "target_text": target_text,
        "draft_occurrences": (
            session.current_draft.count(target_text) if target_text else 0
        ),
        "context_marker": context_marker,
        "confirmed_facts_count": len(session.confirmed_facts or []),
    }
    session.proposal_cache = existing
    return await _persist(db, session)


async def update_cached_context_marker(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_index: int,
    context_marker: int,
) -> ResumeRefinementSession:
    """Re-stamp an entry's ``context_marker`` after serving it appended a
    turn that feeds ``prior_context`` (its own clarify question), so the
    entry stays valid when the user navigates back to it.
    """
    existing = dict(session.proposal_cache or {})
    entry = existing.get(str(target_index))
    if entry is None:
        return session
    existing[str(target_index)] = {**entry, "context_marker": context_marker}
    session.proposal_cache = existing
    return await _persist(db, session)


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
        return await _persist(db, session)
    return session
