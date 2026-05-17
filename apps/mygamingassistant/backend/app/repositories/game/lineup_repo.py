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
