"""Hold no database connection while a refinement session waits on Claude.

A critique or rewrite call takes seconds to minutes. The session row is read
first, the connection is handed back for the call (``release_connection``),
and the result is saved only after the row is re-read, locked, and found
where it was: if the user answered or moved, or the preparation was claimed
again meanwhile, the result belongs to a position the session has left and
is dropped, not written over the newer state. Every write of the result is
staged under that lock and committed once (``session_repo.commit_staged``).
"""
from __future__ import annotations

from datetime import datetime

from platform_shared.db.session import release_connection
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.resume_refinement import session_repo
from app.services.resume_refinement.errors import SessionNotFound
from app.services.resume_refinement.session_position import SessionPosition


async def _locked(db: AsyncSession, session: ResumeRefinementSession) -> ResumeRefinementSession:
    fresh = await session_repo.get_by_id_for_user(
        db, session.id, session.user_id, for_update=True,
    )
    if fresh is None:
        raise SessionNotFound()
    return fresh


async def reload_if_unchanged(
    db: AsyncSession,
    session: ResumeRefinementSession,
    position: SessionPosition,
) -> tuple[ResumeRefinementSession, bool]:
    """Re-read ``session`` locked after a Claude call.

    Returns the fresh row and whether it is still at ``position``. When it
    is, the lock is held until the caller's next commit, so the result is
    saved against exactly the state it was made for. When it isn't, the
    lock is released and the caller should return the fresh row unchanged.

    Raises:
        SessionNotFound: the session no longer exists.
    """
    fresh = await _locked(db, session)
    if SessionPosition.of(fresh) == position:
        return fresh, True
    await release_connection(db)
    return fresh, False


async def lock_if_still_preparing(
    db: AsyncSession,
    session: ResumeRefinementSession,
    claimed_at: datetime | None,
) -> tuple[ResumeRefinementSession, bool]:
    """Re-read ``session`` locked and say whether this preparation still owns it.

    It does while the session is ``preparing`` under the claim taken at
    ``claimed_at``. The lock is then held until the caller's next commit;
    otherwise it is released and the fresh row is left alone.

    Raises:
        SessionNotFound: the session no longer exists.
    """
    fresh = await _locked(db, session)
    if fresh.status == "preparing" and fresh.preparation_started_at == claimed_at:
        return fresh, True
    await release_connection(db)
    return fresh, False
