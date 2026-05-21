"""Lineup repository — all ORM operations for the lineup table.

Filters follow "any" semantics for side: a lineup with side='any' always
appears in side_a and side_b queries, so players see utility that works
on both sides.

All filter parameters are optional. Omitting them returns all rows that
pass the status filter (default: accepted only).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game.lineup import Lineup


@dataclass
class LineupFilters:
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    # "side_a", "side_b", or None (no filter)
    side: Optional[str] = None
    utility_type_ids: list[uuid.UUID] = field(default_factory=list)
    # None → only "accepted"; set explicitly to bypass
    status: Optional[str] = "accepted"


def _apply_filters(stmt: "Select[tuple[Lineup]]", f: LineupFilters) -> "Select[tuple[Lineup]]":
    if f.status is not None:
        stmt = stmt.where(Lineup.status == f.status)
    if f.game_id is not None:
        stmt = stmt.where(Lineup.game_id == f.game_id)
    if f.map_id is not None:
        stmt = stmt.where(Lineup.map_id == f.map_id)
    if f.target_zone_id is not None:
        stmt = stmt.where(Lineup.target_zone_id == f.target_zone_id)
    if f.stand_zone_id is not None:
        stmt = stmt.where(Lineup.stand_zone_id == f.stand_zone_id)
    if f.side is not None:
        # "any" semantics: lineup.side='any' always matches regardless of the
        # requested side.
        stmt = stmt.where(Lineup.side.in_([f.side, "any"]))
    if f.utility_type_ids:
        stmt = stmt.where(Lineup.utility_type_id.in_(f.utility_type_ids))
    return stmt


async def _refresh_set_relations(db: AsyncSession, lineup: Lineup) -> None:
    """Refresh the FK relationship attrs that have a non-null value.

    Ingestion-path rows have null classification FKs until the classifier
    runs (PR 5), so refreshing an unset relationship would be wasted work
    (and ``selectinload`` already populated the loaded ones). Called while
    the row is still attached and before commit; with
    ``expire_on_commit=False`` the refreshed attributes stay populated for
    the post-commit serialization in the service layer.
    """
    attrs_to_refresh = [
        attr
        for attr, fk_field in [
            ("target_zone", "target_zone_id"),
            ("stand_zone", "stand_zone_id"),
            ("utility_type", "utility_type_id"),
        ]
        if getattr(lineup, fk_field) is not None
    ]
    if attrs_to_refresh:
        await db.refresh(lineup, attribute_names=attrs_to_refresh)


async def create_lineup(db: AsyncSession, data: dict) -> Lineup:
    """Insert a new lineup row, commit, and return the refreshed instance.

    Transaction ownership lives here in the repository layer (not the route
    or service): ``platform_shared.db.session.get_db`` does NOT auto-commit,
    so a flush-only write is rolled back when the request session closes.
    Routes/services delegating here must NOT also commit. On failure the
    transaction is rolled back and the error re-raised so the caller can
    surface it (constraint violations become a 4xx/5xx, never a silent loss).

    Relationship attributes are only refreshed when the corresponding FK is
    set — ingestion-path rows have null FKs until the classifier runs (PR 5).
    """
    lineup = Lineup(**data)
    db.add(lineup)
    try:
        await db.flush()
        await _refresh_set_relations(db, lineup)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def list_lineups(
    db: AsyncSession,
    filters: LineupFilters,
) -> list[Lineup]:
    """Return lineups matching *filters*, eager-loading FK relations."""
    stmt = (
        select(Lineup)
        .options(
            selectinload(Lineup.target_zone),
            selectinload(Lineup.stand_zone),
            selectinload(Lineup.utility_type),
        )
        .order_by(Lineup.created_at.desc())
    )
    stmt = _apply_filters(stmt, filters)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_lineup(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> Lineup | None:
    """Return a single lineup by id, or None."""
    stmt = (
        select(Lineup)
        .where(Lineup.id == lineup_id)
        .options(
            selectinload(Lineup.target_zone),
            selectinload(Lineup.stand_zone),
            selectinload(Lineup.utility_type),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_lineup(
    db: AsyncSession,
    lineup: Lineup,
    patch: dict,
) -> Lineup:
    """Apply *patch* fields to *lineup*, commit, and return it.

    This is the fix for the silent data-loss bug: ``PATCH /api/lineups/{id}``
    previously returned 200 (the in-session ORM object reflected the change)
    but the UPDATE was rolled back when ``get_db`` closed the session because
    nothing committed. Transaction ownership now lives here in the repo.
    """
    for key, value in patch.items():
        setattr(lineup, key, value)
    try:
        await db.flush()
        await _refresh_set_relations(db, lineup)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def hide_lineup(db: AsyncSession, lineup: Lineup) -> Lineup:
    """Soft-delete: set status='hidden' and commit."""
    lineup.status = "hidden"
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def get_ingested_video_ids(
    db: AsyncSession,
    video_ids: list[str],
) -> set[str]:
    """Return the subset of video_ids that already have lineup rows.

    Used by the ingestion orchestrator to skip already-processed videos.
    Returns an empty set when video_ids is empty.
    """
    if not video_ids:
        return set()
    stmt = select(Lineup.youtube_video_id).where(
        Lineup.youtube_video_id.in_(video_ids),
    )
    result = await db.execute(stmt)
    return {row for (row,) in result.all() if row is not None}


async def list_pending_lineups(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    source_id: Optional[uuid.UUID] = None,
    confidence_max: Optional[float] = None,
    game_id: Optional[uuid.UUID] = None,
) -> tuple[list[Lineup], int]:
    """Return pending_review lineups with pagination.

    Returns (items, total_count).
    Sorted newest first so freshly ingested lineups appear at top.
    """
    base_stmt = (
        select(Lineup)
        .where(Lineup.status == "pending_review")
        .options(
            selectinload(Lineup.target_zone),
            selectinload(Lineup.stand_zone),
            selectinload(Lineup.utility_type),
        )
    )
    if source_id is not None:
        base_stmt = base_stmt.where(Lineup.source_id == source_id)
    if game_id is not None:
        base_stmt = base_stmt.where(
            (Lineup.game_id == game_id) | (Lineup.suggested_game_id == game_id)
        )
    if confidence_max is not None:
        # "low confidence" filter — show lineups where confidence is null (not yet classified)
        # OR below the threshold.
        base_stmt = base_stmt.where(
            (Lineup.classification_confidence.is_(None))
            | (Lineup.classification_confidence <= confidence_max)
        )

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    items_stmt = base_stmt.order_by(Lineup.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(items_stmt)
    return list(result.scalars().all()), total


async def accept_lineup(
    db: AsyncSession,
    lineup: Lineup,
    overrides: dict,
) -> Lineup:
    """Transition lineup to 'accepted', applying any overrides.

    The overrides dict should contain only fields explicitly provided by the
    caller. The caller is responsible for verifying all required classification
    fields are non-null before calling this.
    """
    for key, value in overrides.items():
        if value is not None:
            setattr(lineup, key, value)
    lineup.status = "accepted"
    try:
        await db.flush()
        await _refresh_set_relations(db, lineup)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return lineup


async def write_classifier_suggestions(
    db: AsyncSession,
    lineup: Lineup,
    suggestions: dict,
) -> None:
    """Write classifier suggestion fields to a lineup row and flush.

    Only sets fields that are present in *suggestions*. Does not change
    lineup.status — the row stays in pending_review until the user accepts.
    """
    for field_name, value in suggestions.items():
        if hasattr(lineup, field_name):
            setattr(lineup, field_name, value)
    await db.flush()


async def commit_classifier_run(db: AsyncSession) -> None:
    """Commit the classifier's flushed suggestion writes for the single-lineup
    reclassify path.

    ``classifier_service.classify_lineup`` writes suggested_* fields and
    flushes but, per its documented contract, leaves the commit to the
    caller (the ingestion orchestrator batches many classify runs into one
    commit; the interactive ``POST /api/lineups/{id}/classify`` route needs
    exactly one). Transaction ownership for that interactive path lives here
    in the repo layer — the route must NOT commit. On failure the
    transaction is rolled back and the error re-raised.
    """
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise


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
) -> Lineup:
    """Persist a fresh full clip onto the THROW pane (ingest + Replace path).

    Writes BOTH ``clip_url`` AND ``clip_url_original`` to ``clip_key`` and
    NULLs out the trim offset pair. A fresh upload IS the source: it starts
    untrimmed, and the editor's slider opens with bounds = full duration.
    The next ``set_clip_url_trim`` will overwrite only ``clip_url`` + the
    offsets and leave ``clip_url_original`` alone so the editor can widen
    past whatever the trim left behind (PR4 pane-editor model).

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
    lineup.clip_url_original = clip_key
    lineup.clip_trim_start_s = None
    lineup.clip_trim_end_s = None
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

    Mirrors :func:`list_accepted_lineups_needing_clips` (PR2) — the two
    backfills are independent (separate operator commands, separate NULL
    columns) and intentionally not coupled. A lineup can have a throw clip
    but no landing clip, or vice versa.
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


async def set_landing_clip_url(
    db: AsyncSession,
    lineup: Lineup,
    landing_clip_key: str,
) -> Lineup:
    """Persist a fresh full clip onto the LANDING pane (ingest + Replace path).

    Writes BOTH ``landing_clip_url`` AND ``landing_clip_url_original`` to
    ``landing_clip_key`` and NULLs out the trim offset pair — same model
    as :func:`set_clip_url` for the throw pane. Lets the editor's trim
    slider open with bounds = full duration on every fresh upload, while
    preserving the source for future widen-the-trim ops via
    :func:`set_landing_clip_url_trim` (PR4 pane-editor model).

    Its own one-column commit (not folded into the throw-clip commit, the
    classifier writeback, or the technique commit) on purpose — identical
    rationale to :func:`set_clip_url` and :func:`set_technique`: the landing
    clip is best-effort and orthogonal to the row's validity (a lineup is
    fully usable from its stills + throw clip + technique with no landing
    clip; the LandingPane gracefully falls back to "Lands in: <zone>"
    text). A landing-clip failure must NEVER roll back the already-committed
    lineup, classifier suggestions, throw clip, or technique; a successful
    landing clip must NOT wait on anything else.

    Transaction ownership lives here in the repo per PR #687/#695 — the
    ingestion orchestrator and the backfill CLI never call db.commit().
    Both columns store a BARE object key (like stand/aim screenshot URLs and
    ``clip_url``); presigning happens at read time in
    ``lineup_service._build_read``.
    """
    lineup.landing_clip_url = landing_clip_key
    lineup.landing_clip_url_original = landing_clip_key
    lineup.landing_clip_trim_start_s = None
    lineup.landing_clip_trim_end_s = None
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

    Sibling to :func:`set_clip_url_trim` — identical contract, independent
    column. Writes ONLY ``landing_clip_url`` and the offsets; preserves
    ``landing_clip_url_original`` so the next trim can again cut from the
    full source (PR4 pane-editor model).
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

    Mirrors :func:`list_accepted_lineups_needing_clips` (PR2) /
    :func:`list_accepted_lineups_needing_landing_clips` (PR5) — the three
    backfills are independent (separate operator commands, separate NULL
    columns) and intentionally not coupled.
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
) -> Lineup:
    """Persist the generated stand micro-clip's bare MinIO key onto a lineup.

    One-column commit on purpose — same rationale as :func:`set_clip_url` /
    :func:`set_landing_clip_url`: the stand clip is best-effort and orthogonal
    to lineup validity (the stand still already covers this pane; the clip is
    a motion upgrade). A stand-clip failure must NEVER roll back the lineup
    or the sibling aim clip; a stand-clip success must NOT wait on the aim
    clip or any other parallel writer.

    Transaction ownership lives here in the repo per PR #687/#695 — callers
    (ingestion orchestrator + backfill CLI) never call db.commit().
    ``stand_clip_url`` stores a BARE object key; presigning happens at read
    time in ``lineup_service._build_read``.
    """
    lineup.stand_clip_url = stand_clip_key
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
) -> Lineup:
    """Persist the generated aim micro-clip's bare MinIO key onto a lineup.

    Sibling to :func:`set_stand_clip_url` — identical contract, independent
    column. Anchoring on the same chapter timestamp the classifier chose for
    ``aim_screenshot_url`` is what keeps the existing ``aim_anchor_x/y``
    overlay pixel-accurate on the clip's first frame (the first frame IS the
    aim still).
    """
    lineup.aim_clip_url = aim_clip_key
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

    Mirrors :func:`list_accepted_lineups_needing_clips` (PR2) — the two
    backfills are independent (separate operator commands, separate NULL
    columns) and intentionally not coupled.
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
    :func:`set_clip_url`: technique is best-effort and orthogonal to the
    row's validity (a lineup is fully usable from its stills/clip with no
    technique). A technique failure must NEVER roll back the already-committed
    lineup, classifier suggestions, or clip; a successful technique must NOT
    wait on anything else. So the technique pipeline commits exactly this one
    column on its own.

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


async def zone_density(
    db: AsyncSession,
    map_id: uuid.UUID,
    side: Optional[str],
    utility_type_ids: list[uuid.UUID],
) -> dict[str, dict]:
    """Return per-zone lineup counts, grouped by utility_type slug.

    Returns a dict keyed by target_zone_id (as string):
      {
        "<zone_id>": {
          "count": 3,
          "by_utility": {"smoke": 2, "flash": 1}
        }
      }
    """
    from app.models.game.utility_type import UtilityType

    stmt = (
        select(
            Lineup.target_zone_id,
            UtilityType.slug.label("util_slug"),
            func.count().label("cnt"),
        )
        .join(UtilityType, Lineup.utility_type_id == UtilityType.id)
        .where(
            Lineup.map_id == map_id,
            Lineup.status == "accepted",
        )
        .group_by(Lineup.target_zone_id, UtilityType.slug)
    )
    if side is not None:
        stmt = stmt.where(Lineup.side.in_([side, "any"]))
    if utility_type_ids:
        stmt = stmt.where(Lineup.utility_type_id.in_(utility_type_ids))

    rows = (await db.execute(stmt)).all()

    result: dict[str, dict] = {}
    for zone_id, util_slug, cnt in rows:
        key = str(zone_id)
        if key not in result:
            result[key] = {"count": 0, "by_utility": {}}
        result[key]["count"] += cnt
        result[key]["by_utility"][util_slug] = result[key]["by_utility"].get(util_slug, 0) + cnt

    return result
