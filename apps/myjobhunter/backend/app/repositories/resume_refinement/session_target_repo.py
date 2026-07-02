"""Repository helpers for user-created improvement targets.

Sibling module to ``session_repo.py`` (which sits at the 500-LOC growth
guard). Same conventions: mutate the ORM row, reassign fresh containers
for JSONB change detection, flush + commit + refresh.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession


def _shift_index_keys(index_keyed: dict | None, *, insert_at: int) -> dict:
    """Remap a ``{str(target_index): value}`` dict after a list insert.

    ``proposal_cache`` and ``guard_flag_counts`` are keyed by stringified
    target index; inserting a target mid-list shifts every later target
    up by one, so keys >= ``insert_at`` must shift too or navigation
    would hydrate the WRONG cached proposal for shifted targets.
    """
    shifted: dict = {}
    for key, value in (index_keyed or {}).items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            shifted[key] = value
            continue
        shifted[str(index + 1 if index >= insert_at else index)] = value
    return shifted


async def insert_target_at(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target: dict,
    insert_at: int,
) -> ResumeRefinementSession:
    """Insert ``target`` at ``insert_at`` and make it the active target.

    Clears pending proposal state (it belonged to the previously-active
    target) and bumps ``turn_count`` for the user turn the caller just
    appended. The index-keyed JSONB side tables are remapped so cached
    proposals stay attached to the right targets.
    """
    targets = list(session.improvement_targets or [])
    insert_at = max(0, min(insert_at, len(targets)))
    targets.insert(insert_at, dict(target))

    session.improvement_targets = targets
    session.proposal_cache = _shift_index_keys(
        session.proposal_cache, insert_at=insert_at,
    )
    session.guard_flag_counts = _shift_index_keys(
        session.guard_flag_counts, insert_at=insert_at,
    )
    session.target_index = insert_at
    session.pending_target_section = None
    session.pending_proposal = None
    session.pending_rationale = None
    session.pending_clarifying_question = None
    session.pending_guard_flagged = None
    session.pending_flagged_proposal = None
    session.turn_count += 1
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session
