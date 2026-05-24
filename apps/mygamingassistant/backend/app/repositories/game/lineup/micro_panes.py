"""Micro-pane writers — the STAND + AIM micro-clip columns and their stills.

Also owns the STAND-localizer's persistence (``set_stand_localization``):
the localized ``stand_ts`` + ``stand_localized_at`` "we tried" marker
share the micro-pane lifecycle (both are cleared together when the
operator wants a fresh localize).

Sibling to ``throw_pane`` / ``landing_pane``. STAND and AIM are the two
upper panes of the 4-pane storyboard; each has both a screenshot still
(operator-Replace surface) and a 1-second micro-clip (PR6 motion upgrade).
All four columns live here because the panes share the backfill list and
the same per-side independence contract: a stand-side failure NEVER rolls
back the aim side and vice versa.

The one-column commit posture exists for a reason — see each setter's
docstring. Do NOT refactor into a multi-column transaction.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup


async def list_accepted_lineups_needing_micro_clips(
    db: AsyncSession,
) -> list[Lineup]:
    """Accepted, ingested lineups missing EITHER stand or aim micro-clip.

    The PR6 backfill set: ``status='accepted'`` AND a source video to re-fetch
    (``youtube_video_id`` not null) AND at least ONE of the two micro-clip
    columns is still null. A single composite list (rather than two separate
    lists) means a video is fetched + downloaded ONCE per backfill run even
    when it backs many lineups — the generator handles partial state
    internally, skipping the side that's already populated.

    Idempotent: once both columns are set, the lineup drops out of the set.
    Re-running only touches the remainder. Ordered oldest-first so a long
    backfill makes monotonic progress.

    Mirrors :func:`throw_pane.list_accepted_lineups_needing_clips` (PR2) /
    :func:`landing_pane.list_accepted_lineups_needing_landing_clips` (PR5) —
    the three backfills are independent (separate operator commands, separate
    NULL columns) and intentionally not coupled.
    """
    stmt = (
        select(Lineup)
        .where(
            Lineup.status == "accepted",
            Lineup.youtube_video_id.is_not(None),
            (
                Lineup.stand_clip_url.is_(None)
                | Lineup.aim_clip_url.is_(None)
            ),
        )
        .order_by(Lineup.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def set_stand_clip_url(
    db: AsyncSession,
    lineup: Lineup,
    stand_clip_key: str,
    *,
    offset_s: float | None = None,
) -> Lineup:
    """Persist the generated stand micro-clip's bare MinIO key onto a lineup.

    Two shapes:

    **Ingest / backfill shape** (default — ``offset_s=None``): writes
    ``stand_clip_url`` only. Used when the offset can't be computed because
    the wider source ``clip_url_original`` wasn't established yet (legacy
    rows, wide-source cut failed, etc.). ``stand_clip_offset_s`` is left
    untouched — NULL stays NULL.

    **Shift / wider-source-aware shape** (``offset_s=`` set): also writes
    ``stand_clip_offset_s`` so the STAND shift-window editor opens its slider
    at the right initial position. The offset is in seconds from the start of
    ``clip_url_original`` (the shared wider source — micro-clip widening
    reuses the chapter's existing wider source bytes rather than cutting a
    per-pane original). NULL and 0.0 are distinct: the shift overlay treats
    NULL as "no offset known, slider opens at 0" and any persisted value
    (including 0.0) as a real operator choice.

    Two-column commit on purpose — same rationale as
    :func:`throw_pane.set_clip_url` / :func:`landing_pane.set_landing_clip_url`:
    the stand clip is best-effort and orthogonal to lineup validity (the
    stand still already covers this pane; the clip is a motion upgrade). A
    stand-clip failure must NEVER roll back the lineup or the sibling aim
    clip; a stand-clip success must NOT wait on the aim clip or any other
    parallel writer.

    Transaction ownership lives here in the repo per PR #687/#695 — callers
    (ingestion orchestrator + backfill CLI + shift endpoint) never call
    db.commit(). ``stand_clip_url`` stores a BARE object key; presigning
    happens at read time in ``lineup_service._build_read``.
    """
    lineup.stand_clip_url = stand_clip_key
    if offset_s is not None:
        lineup.stand_clip_offset_s = offset_s
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_aim_clip_url(
    db: AsyncSession,
    lineup: Lineup,
    aim_clip_key: str,
    *,
    offset_s: float | None = None,
) -> Lineup:
    """Persist the generated aim micro-clip's bare MinIO key onto a lineup.

    Sibling to :func:`set_stand_clip_url` — identical two-shape contract,
    independent ``aim_clip_url`` + ``aim_clip_offset_s`` columns. Anchoring on
    the same chapter timestamp the classifier chose for ``aim_screenshot_url``
    is what keeps the existing ``aim_anchor_x/y`` overlay pixel-accurate on
    the clip's first frame (the first frame IS the aim still).
    """
    lineup.aim_clip_url = aim_clip_key
    if offset_s is not None:
        lineup.aim_clip_offset_s = offset_s
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_stand_screenshot_url(
    db: AsyncSession,
    lineup: Lineup,
    stand_screenshot_key: str,
) -> Lineup:
    """Persist a new stand-still bare MinIO key onto a lineup row.

    Operator-facing setter for the per-pane Replace flow (PR1). One-column
    commit on purpose — identical contract to :func:`set_stand_clip_url` and
    siblings: a screenshot replace is best-effort and orthogonal to the
    classifier suggestions / sibling clip column, and must NEVER roll back
    them.

    Transaction ownership lives here in the repo per PR #687/#695 — the
    pane-upload service never calls db.commit(). ``stand_screenshot_url``
    stores a BARE object key (same convention as every other URL column);
    presigning happens at read time in ``lineup_service._build_read``.
    """
    lineup.stand_screenshot_url = stand_screenshot_key
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_stand_localization(
    db: AsyncSession,
    lineup: Lineup,
    *,
    stand_ts: Optional[float],
    stand_localized_at: datetime,
) -> Lineup:
    """Persist the STAND-localizer's verdict onto a lineup row.

    Writes both columns in one commit. The pair is conceptually atomic:
    ``stand_localized_at`` is the "we tried" marker; ``stand_ts`` is the
    verdict (a float for a found demo, NULL for a confident "no demo").
    Writing only one would leave the cache half-set and the next backfill
    re-running Claude or misreading the result.

    Operator NULLs BOTH columns to force a re-localize. NULLing only one
    is undefined-behaviour from the lineup's perspective — the backfill
    treats it as "never tried" via the ``stand_localized_at`` check.

    Transaction ownership lives here in the repo per PR #687/#695 —
    callers (micro_clip_helpers._resolve_stand_ts) never call
    db.commit(). A failure rolls back both columns and propagates so the
    caller can surface a structured error.
    """
    lineup.stand_ts = stand_ts
    lineup.stand_localized_at = stand_localized_at
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_aim_screenshot_url(
    db: AsyncSession,
    lineup: Lineup,
    aim_screenshot_key: str,
) -> Lineup:
    """Persist a new aim-still bare MinIO key onto a lineup row.

    Sibling to :func:`set_stand_screenshot_url` — identical contract,
    independent column. Replacing the aim still does NOT affect the persisted
    ``aim_anchor_x/y`` overlay coords (those are normalized 0..1) — the dot
    will continue to render at the same proportional position over whatever
    image now occupies the slot. The operator can re-classify or hand-edit
    the anchor coords separately via the existing PATCH route.
    """
    lineup.aim_screenshot_url = aim_screenshot_key
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup
