"""Landing-pane writers — the LANDING clip column + poster still.

Sibling to ``throw_pane``: four one-column commit setters
(``set_landing_clip_url``, ``set_landing_clip_url_original``,
``set_landing_clip_url_trim``, ``set_landing_screenshot_url``) and the
backfill list query ``list_accepted_lineups_needing_landing_clips``. The
widen-source list lives in ``throw_pane`` because a single query covers both
panes (operator runs widen-source once for both).

The one-column commit posture exists for a reason — see each setter's
docstring. A landing-clip failure must NEVER roll back the lineup or the
sibling throw clip.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup


async def list_accepted_lineups_needing_landing_clips(
    db: AsyncSession,
) -> list[Lineup]:
    """Accepted, ingested lineups that don't have a landing clip yet.

    The PR5 backfill set: ``status='accepted'`` AND a source video to
    re-fetch (``youtube_video_id`` not null — manual uploads have no source
    frames so a landing clip is never extractable for them) AND no landing
    clip yet (``landing_clip_url`` null). Filtering on null
    ``landing_clip_url`` is exactly what makes the backfill idempotent — a
    generated landing clip drops out of this set, so re-running only touches
    the remainder. Ordered oldest-first so a long backfill makes visible
    monotonic progress.

    Mirrors :func:`throw_pane.list_accepted_lineups_needing_clips` (PR2) —
    the two backfills are independent (separate operator commands, separate
    NULL columns) and intentionally not coupled. A lineup can have a throw
    clip but no landing clip, or vice versa.
    """
    stmt = (
        select(Lineup)
        .where(
            Lineup.status == "accepted",
            Lineup.youtube_video_id.is_not(None),
            Lineup.landing_clip_url.is_(None),
        )
        .order_by(Lineup.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_accepted_lineups_needing_posters(
    db: AsyncSession,
) -> list[Lineup]:
    """Accepted, ingested lineups with a clip but no poster still yet.

    The #984 poster backfill set. A poster still is the last-frame WebP of an
    already-cut clip (see ``poster_generator`` / ``poster_extractor``): the
    STAND poster upgrades ``stand_screenshot_url`` (replacing the classifier's
    grid PNG for video-ingested lineups) and the LANDING poster fills the new
    ``landing_screenshot_url``. A lineup needs poster work when it has the
    source clip but its screenshot column isn't yet a ``*-poster.webp`` key:

      * STAND   — ``stand_clip_url`` set AND ``stand_screenshot_url`` is null or
        still the classifier ``.png`` (not ``*-stand-poster.webp``).
      * LANDING — ``landing_clip_url`` set AND ``landing_screenshot_url`` is null
        or not yet ``*-landing-poster.webp``.

    ``youtube_video_id`` not null excludes the image-ingested lineups (which
    have no clip to derive a poster from and keep their manual stand still —
    the LANDING half renders the "Lands in: <zone>" text fallback). Matching on
    the poster-key suffix is what makes the backfill idempotent — once both
    sides carry a ``*-poster.webp`` key the lineup drops out of the set, so a
    re-run only touches the remainder. Ordered oldest-first for monotonic
    progress.

    Mirrors the sibling backfill lists (:func:`list_accepted_lineups_needing_landing_clips`,
    :func:`micro_panes.list_accepted_lineups_needing_micro_clips`) — one
    composite list so a video's lineups are visited together, and the generator
    handles partial (one-side-done) state internally.
    """
    stmt = (
        select(Lineup)
        .where(
            Lineup.status == "accepted",
            Lineup.youtube_video_id.is_not(None),
            (
                (
                    Lineup.stand_clip_url.is_not(None)
                    & (
                        Lineup.stand_screenshot_url.is_(None)
                        | Lineup.stand_screenshot_url.notlike(
                            "%-stand-poster.webp"
                        )
                    )
                )
                | (
                    Lineup.landing_clip_url.is_not(None)
                    & (
                        Lineup.landing_screenshot_url.is_(None)
                        | Lineup.landing_screenshot_url.notlike(
                            "%-landing-poster.webp"
                        )
                    )
                )
            ),
        )
        .order_by(Lineup.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def set_landing_clip_url(
    db: AsyncSession,
    lineup: Lineup,
    landing_clip_key: str,
    *,
    source_key: str | None = None,
    trim_start_s: float | None = None,
    trim_end_s: float | None = None,
) -> Lineup:
    """Persist a fresh full clip onto the LANDING pane (ingest + Replace path).

    Sibling to :func:`throw_pane.set_clip_url` — same two shapes:

    **Replace shape** (default — no kwargs): writes BOTH ``landing_clip_url``
    AND ``landing_clip_url_original`` to ``landing_clip_key`` and NULLs out
    the trim offsets. Slider opens with bounds = full duration.

    **Widened-source shape** (``source_key`` + offsets provided): writes
    ``landing_clip_url=landing_clip_key`` (the tight served landing clip)
    but ``landing_clip_url_original=source_key`` (wider) and persists the
    offsets the tight clip occupies inside the wider source. Slider opens
    at the tight bounds and the operator can widen the trim past those
    bounds without re-fetching the YouTube video.

    Its own one-column commit (not folded into the throw-clip commit, the
    classifier writeback, or the technique commit) on purpose — identical
    rationale to :func:`throw_pane.set_clip_url` and :func:`technique.set_technique`:
    the landing clip is best-effort and orthogonal to the row's validity
    (a lineup is fully usable from its stills + throw clip + technique with
    no landing clip; the LandingPane gracefully falls back to "Lands in:
    <zone>" text). A landing-clip failure must NEVER roll back the
    already-committed lineup, classifier suggestions, throw clip, or
    technique; a successful landing clip must NOT wait on anything else.

    Transaction ownership lives here in the repo per PR #687/#695 — the
    ingestion orchestrator and the backfill CLI never call db.commit().
    Both columns store a BARE object key (like stand/aim screenshot URLs and
    ``clip_url``); presigning happens at read time in
    ``lineup_service._build_read``.
    """
    lineup.landing_clip_url = landing_clip_key
    lineup.landing_clip_url_original = (
        source_key if source_key is not None else landing_clip_key
    )
    lineup.landing_clip_trim_start_s = trim_start_s
    lineup.landing_clip_trim_end_s = trim_end_s
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_landing_clip_url_original(
    db: AsyncSession,
    lineup: Lineup,
    source_key: str,
) -> Lineup:
    """Persist a freshly-widened source clip onto the LANDING pane (backfill).

    Sibling to :func:`throw_pane.set_clip_url_original` — identical contract,
    independent column. Only ``landing_clip_url_original`` moves; the served
    tight ``landing_clip_url`` and the trim offsets stay as they were.
    Offsets stay NULL so the slider opens at the full wide bounds and the
    operator drags to refine the landing trim.
    """
    lineup.landing_clip_url_original = source_key
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_landing_clip_url_trim(
    db: AsyncSession,
    lineup: Lineup,
    trimmed_landing_clip_key: str,
    start_offset_s: float,
    end_offset_s: float,
) -> Lineup:
    """Persist a TRIMMED LANDING clip + its offsets (Trim path).

    Sibling to :func:`throw_pane.set_clip_url_trim` — identical contract,
    independent column. Writes ONLY ``landing_clip_url`` and the offsets;
    preserves ``landing_clip_url_original`` so the next trim can again cut
    from the full source (PR4 pane-editor model).
    """
    lineup.landing_clip_url = trimmed_landing_clip_key
    lineup.landing_clip_trim_start_s = start_offset_s
    lineup.landing_clip_trim_end_s = end_offset_s
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_landing_screenshot_url(
    db: AsyncSession,
    lineup: Lineup,
    landing_screenshot_key: str,
) -> Lineup:
    """Persist a new landing-poster bare MinIO key onto a lineup row.

    Sibling to :func:`micro_panes.set_stand_screenshot_url` /
    :func:`micro_panes.set_aim_screenshot_url` — identical one-column-commit
    contract, independent column. The poster is a WebP still extracted from
    the last frame of the LANDING micro-clip (see
    ``app.services.ingestion.poster_extractor``), giving the LANDING pane an
    instant-render fallback in place of the live-video clip. Best-effort and
    orthogonal to lineup validity — a landing-poster failure must NEVER roll
    back the lineup or any sibling clip/screenshot column.

    Transaction ownership lives here in the repo per PR #687/#695 — callers
    never call db.commit(). ``landing_screenshot_url`` stores a BARE object
    key (same convention as every other URL column); presigning happens at
    read time in ``lineup_service._build_read``.
    """
    lineup.landing_screenshot_url = landing_screenshot_key
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup
