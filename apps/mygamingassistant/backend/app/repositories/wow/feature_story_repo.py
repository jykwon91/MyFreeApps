"""WowFeatureStory repository — ORM operations for ``wow_feature_story``.

The PUBLIC allowlist lives HERE, in the query: every ``*_public`` function
filters to non-hidden rows in ``PUBLIC_STORY_STATUSES``, so a private story
(``submitted`` / ``duplicate``) or a hidden one can't reach a public read even
if a caller forgets to check. The caller owns the transaction; these only flush.
"""
from __future__ import annotations

import uuid
from collections.abc import Collection, Sequence

from sqlalchemy import ColumnElement, Row, and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_feature_request_enums import PUBLIC_STORY_STATUSES, SORT_NEW
from app.models.wow.feature_story import WowFeatureStory
from app.models.wow.feature_vote import WowFeatureVote


def _public_visible() -> ColumnElement[bool]:
    return and_(
        WowFeatureStory.hidden_at.is_(None),
        WowFeatureStory.status.in_(PUBLIC_STORY_STATUSES),
    )


async def list_public(
    db: AsyncSession,
    *,
    statuses: Collection[str],
    area: str | None,
    sort: str,
    limit: int,
    offset: int,
) -> tuple[list[WowFeatureStory], int]:
    """One page of the board and the total matching rows."""
    allowed = [s for s in statuses if s in PUBLIC_STORY_STATUSES]
    conditions = [_public_visible(), WowFeatureStory.status.in_(allowed)]
    if area is not None:
        conditions.append(WowFeatureStory.area == area)
    order = (
        (WowFeatureStory.created_at.desc(), WowFeatureStory.id)
        if sort == SORT_NEW
        else (WowFeatureStory.vote_count.desc(), WowFeatureStory.created_at.desc(), WowFeatureStory.id)
    )
    rows = await db.execute(select(WowFeatureStory).where(*conditions).order_by(*order).limit(limit).offset(offset))
    total = await db.scalar(select(func.count()).select_from(WowFeatureStory).where(*conditions))
    return list(rows.scalars().all()), int(total or 0)


async def get_public(db: AsyncSession, story_id: uuid.UUID) -> WowFeatureStory | None:
    return await db.scalar(select(WowFeatureStory).where(WowFeatureStory.id == story_id, _public_visible()))


async def get_public_for_update(db: AsyncSession, story_id: uuid.UUID) -> WowFeatureStory | None:
    return await db.scalar(
        select(WowFeatureStory).where(WowFeatureStory.id == story_id, _public_visible()).with_for_update()
    )


async def get(db: AsyncSession, story_id: uuid.UUID) -> WowFeatureStory | None:
    return await db.get(WowFeatureStory, story_id)


async def get_for_update(db: AsyncSession, story_id: uuid.UUID) -> WowFeatureStory | None:
    return await db.scalar(select(WowFeatureStory).where(WowFeatureStory.id == story_id).with_for_update())


async def lock_many(db: AsyncSession, story_ids: Collection[uuid.UUID]) -> dict[uuid.UUID, WowFeatureStory]:
    """Lock rows in id order (a fixed order, so two merges can't deadlock)."""
    rows = await db.execute(
        select(WowFeatureStory)
        .where(WowFeatureStory.id.in_(list(story_ids)))
        .order_by(WowFeatureStory.id)
        .with_for_update()
    )
    return {row.id: row for row in rows.scalars().all()}


async def by_ids(db: AsyncSession, story_ids: Collection[uuid.UUID]) -> dict[uuid.UUID, WowFeatureStory]:
    if not story_ids:
        return {}
    rows = await db.execute(select(WowFeatureStory).where(WowFeatureStory.id.in_(list(story_ids))))
    return {row.id: row for row in rows.scalars().all()}


async def list_dedupe_candidates(db: AsyncSession, *, limit: int) -> Sequence[Row[tuple[uuid.UUID, str, str, str]]]:
    """Public, non-hidden stories (never merged ones) — most-voted first."""
    rows = await db.execute(
        select(WowFeatureStory.id, WowFeatureStory.title, WowFeatureStory.i_want, WowFeatureStory.area)
        .where(_public_visible())
        .order_by(WowFeatureStory.vote_count.desc(), WowFeatureStory.created_at.desc())
        .limit(limit)
    )
    return rows.all()


async def list_for_triage(db: AsyncSession, *, statuses: Collection[str] | None) -> list[WowFeatureStory]:
    query = select(WowFeatureStory).order_by(WowFeatureStory.created_at)
    if statuses:
        query = query.where(WowFeatureStory.status.in_(list(statuses)))
    rows = await db.execute(query)
    return list(rows.scalars().all())


def add(db: AsyncSession, values: dict[str, object]) -> WowFeatureStory:
    row = WowFeatureStory(**values)
    db.add(row)
    return row


def apply(row: WowFeatureStory, values: dict[str, object]) -> None:
    for field, value in values.items():
        setattr(row, field, value)


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def repoint_merged_children(db: AsyncSession, *, from_id: uuid.UUID, to_id: uuid.UUID) -> int:
    """Stories merged into ``from_id`` now point at ``to_id`` (one hop, always)."""
    result = await db.execute(
        update(WowFeatureStory)
        .where(WowFeatureStory.merged_into_id == from_id)
        .values(merged_into_id=to_id)
        .execution_options(synchronize_session="fetch")
    )
    return int(result.rowcount or 0)


async def count_votes(db: AsyncSession, story_id: uuid.UUID) -> int:
    total = await db.scalar(select(func.count()).select_from(WowFeatureVote).where(WowFeatureVote.story_id == story_id))
    return int(total or 0)
