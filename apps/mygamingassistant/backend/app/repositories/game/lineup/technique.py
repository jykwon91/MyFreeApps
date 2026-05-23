"""Technique writer — the throw-technique footer column.

Sibling to ``throw_pane`` / ``landing_pane`` / ``micro_panes``. The
technique is the human-readable phrase ("standing jumpthrow", "running
left-click", etc.) shown as the throw-pane footer.

The one-column commit posture exists for a reason — see ``set_technique``'s
docstring. A technique failure must NEVER roll back the lineup or any
sibling pane.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup


async def list_accepted_lineups_needing_technique(
    db: AsyncSession,
) -> list[Lineup]:
    """Accepted, ingested lineups that don't have a technique yet.

    The PR3 backfill set: ``status='accepted'`` AND a source video to
    re-fetch (``youtube_video_id`` not null — this clause is *input-modality*
    gating, not an incidental filter: manual uploads have no source frames so
    technique is never extractable for them) AND no technique yet
    (``technique`` null). Filtering on null ``technique`` is exactly what
    makes the backfill idempotent — a populated technique drops out of this
    set, so re-running only touches the remainder. Ordered oldest-first so a
    long backfill makes visible monotonic progress.

    Mirrors :func:`throw_pane.list_accepted_lineups_needing_clips` (PR2) —
    the two backfills are independent (separate operator commands, separate
    NULL columns) and intentionally not coupled.
    """
    stmt = (
        select(Lineup)
        .where(
            Lineup.status == "accepted",
            Lineup.youtube_video_id.is_not(None),
            Lineup.technique.is_(None),
        )
        .order_by(Lineup.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def set_technique(
    db: AsyncSession,
    lineup: Lineup,
    technique: str | None,
) -> Lineup:
    """Persist the throw-technique phrase onto a lineup row.

    Its own one-column commit (not folded into the classifier writeback or
    the clip commit) on purpose — identical rationale to
    :func:`throw_pane.set_clip_url`: technique is best-effort and orthogonal
    to the row's validity (a lineup is fully usable from its stills/clip
    with no technique). A technique failure must NEVER roll back the
    already-committed lineup, classifier suggestions, or clip; a successful
    technique must NOT wait on anything else. So the technique pipeline
    commits exactly this one column on its own.

    Transaction ownership lives here in the repo per PR #687/#695 — the
    ingestion orchestrator and the backfill CLI never call db.commit().
    """
    lineup.technique = technique
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup
