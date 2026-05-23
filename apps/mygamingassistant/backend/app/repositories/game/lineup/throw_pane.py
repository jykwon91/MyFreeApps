"""Throw-pane writers — the THROW clip column + its widen-source candidate list.

Holds the THROW pane's three one-column commit setters (``set_clip_url``,
``set_clip_url_original``, ``set_clip_url_trim``) and the two backfill list
queries that drive them (``list_accepted_lineups_needing_clips`` for fresh
generation, ``list_accepted_lineups_needing_widen_source`` for the
shared THROW+LANDING widen-source backfill).

The one-column commit posture exists for a reason — see each setter's
docstring. Do NOT refactor into a multi-column transaction: a pane failure
must NEVER roll back unrelated state.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup


async def list_accepted_lineups_needing_clips(
    db: AsyncSession,
) -> list[Lineup]:
    """Accepted, ingested lineups that don't have a clip yet.

    The backfill set: ``status='accepted'`` AND a source video to re-fetch
    (``youtube_video_id`` not null) AND no clip yet (``clip_url`` null).
    Filtering on null ``clip_url`` is exactly what makes the backfill
    idempotent — a generated clip drops out of this set, so re-running only
    touches the remainder. Ordered oldest-first so a long backfill makes
    visible monotonic progress.
    """
    stmt = (
        select(Lineup)
        .where(
            Lineup.status == "accepted",
            Lineup.youtube_video_id.is_not(None),
            Lineup.clip_url.is_(None),
        )
        .order_by(Lineup.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def set_clip_url(
    db: AsyncSession,
    lineup: Lineup,
    clip_key: str,
    *,
    source_key: str | None = None,
    trim_start_s: float | None = None,
    trim_end_s: float | None = None,
) -> Lineup:
    """Persist a fresh full clip onto the THROW pane (ingest + Replace path).

    Two shapes, selected by the optional widening kwargs:

    **Replace shape** (default — no kwargs): writes BOTH ``clip_url`` AND
    ``clip_url_original`` to ``clip_key`` and NULLs out the trim offsets. A
    fresh operator upload IS the source; it starts untrimmed and the editor's
    slider opens with bounds = full duration. This is the byte-identical
    posture from before the widen-source change.

    **Widened-source shape** (``source_key`` + offsets provided): writes
    ``clip_url=clip_key`` (the tight served clip) but ``clip_url_original=
    source_key`` (the wider clip the trim editor reads from) and persists
    the offsets the tight clip occupies inside the wider source. The slider
    opens at the tight bounds already trimmed, and the operator can widen
    the trim past those bounds without re-fetching the YouTube video.

    Either shape's next ``set_clip_url_trim`` overwrites only ``clip_url`` +
    the offsets and leaves ``clip_url_original`` alone, so the operator can
    keep widening past previous trims (PR4 pane-editor model).

    Its own commit (not folded into the classifier writeback) on purpose:
    clip generation is best-effort and orthogonal to the row's validity — a
    lineup is fully usable from its two stills with no clip. A clip failure
    must NEVER roll back the already-committed lineup + classifier
    suggestions, and a successful clip must NOT wait on anything else. So the
    clip pipeline commits exactly this one column on its own.

    Transaction ownership lives here in the repo per PR #687/#695 — the
    ingestion orchestrator and the backfill CLI never call db.commit().
    Both columns store a BARE object key (like stand/aim screenshot URLs);
    presigning happens at read time in ``lineup_service._build_read``.
    """
    lineup.clip_url = clip_key
    lineup.clip_url_original = source_key if source_key is not None else clip_key
    lineup.clip_trim_start_s = trim_start_s
    lineup.clip_trim_end_s = trim_end_s
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_clip_url_original(
    db: AsyncSession,
    lineup: Lineup,
    source_key: str,
) -> Lineup:
    """Persist a freshly-widened source clip onto the THROW pane (backfill).

    The widen-source backfill cuts a wider clip from the chapter + padding
    and uploads it under a distinct key from the tight ``clip_url``. Only
    ``clip_url_original`` moves; the served tight ``clip_url`` and the trim
    offsets stay as they were. Offsets are left NULL deliberately: the
    backfill doesn't know where the tight clip sits inside the wider source
    (we don't re-run Claude — see ``widen_source_backfill`` for the
    rationale), so the slider opens at the full wide bounds and the operator
    drags to refine. The previously-served tight bytes remain in MinIO and
    autoplay is unchanged.

    Same one-column commit posture as :func:`set_clip_url_trim` — backfill
    is best-effort and must never roll back unrelated state.
    """
    lineup.clip_url_original = source_key
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def set_clip_url_trim(
    db: AsyncSession,
    lineup: Lineup,
    trimmed_clip_key: str,
    start_offset_s: float,
    end_offset_s: float,
) -> Lineup:
    """Persist a TRIMMED THROW clip + its offsets into the source (Trim path).

    Writes ONLY ``clip_url`` and the offset pair. ``clip_url_original`` is
    deliberately left untouched so subsequent trims still cut from the full
    source — this is what lets the operator widen the trim window past the
    previous trim's bounds (PR4 pane-editor model). Callers MUST have set
    ``clip_url_original`` via :func:`set_clip_url` (Replace/ingest) before
    invoking trim; the trim service is responsible for that precondition.

    Same one-column commit posture as :func:`set_clip_url` — trim is
    best-effort and orthogonal to lineup validity; failures here must never
    roll back unrelated state.
    """
    lineup.clip_url = trimmed_clip_key
    lineup.clip_trim_start_s = start_offset_s
    lineup.clip_trim_end_s = end_offset_s
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def list_accepted_lineups_needing_widen_source(
    db: AsyncSession,
) -> list[Lineup]:
    """Accepted, ingested lineups whose trim-editor source still equals the
    tight served clip — the widen-source backfill candidate set.

    The 0015 migration backfilled ``*_url_original = *_url`` on pre-existing
    rows so the trim editor had something to read; widen-source's job is to
    replace those equal pairs with a wider source clip the operator can
    drag past the tight bounds. A row qualifies if EITHER pane's tight ==
    wide (independent panes; one or both may need widening). The operator
    runs this once post-deploy; safe to re-run.

    Filtering on equality is exactly what makes the backfill idempotent —
    a widened pane stops matching (``clip_url_original != clip_url``) and
    drops out of the work for that pane. Ordered oldest-first so a long
    backfill makes monotonic progress; mirrors the other ``list_*_needing_*``
    queries.

    The ``youtube_video_id IS NOT NULL`` clause is input-modality gating
    (per ``list_accepted_lineups_needing_clips``): manual uploads have no
    source video to re-fetch, so a wider clip is unreachable for them.
    """
    stmt = (
        select(Lineup)
        .where(
            Lineup.status == "accepted",
            Lineup.youtube_video_id.is_not(None),
            (
                (
                    Lineup.clip_url.is_not(None)
                    & (Lineup.clip_url_original == Lineup.clip_url)
                )
                | (
                    Lineup.landing_clip_url.is_not(None)
                    & (
                        Lineup.landing_clip_url_original
                        == Lineup.landing_clip_url
                    )
                )
            ),
        )
        .order_by(Lineup.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
