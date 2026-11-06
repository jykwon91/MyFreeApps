"""WowFeatureVote repository — ORM operations for ``wow_feature_vote``.

Callers lock the story row (FOR UPDATE) first, so the per-network count and
the insert/delete happen without a concurrent vote on the same story.
"""
from __future__ import annotations

import uuid
from collections.abc import Collection
from datetime import datetime

from sqlalchemy import delete, func, literal, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.feature_vote import WowFeatureVote


async def insert_if_absent(
    db: AsyncSession, *, story_id: uuid.UUID, voter_key: str, ip_hash: str, source: str
) -> bool:
    """INSERT ... ON CONFLICT DO NOTHING. True when a vote row was added."""
    result = await db.execute(
        insert(WowFeatureVote)
        .values(id=uuid.uuid4(), story_id=story_id, voter_key=voter_key, ip_hash=ip_hash, source=source)
        .on_conflict_do_nothing(constraint="uq_wowfeaturevote_story_voter")
        .returning(WowFeatureVote.id)
    )
    return result.scalar_one_or_none() is not None


async def delete_vote(db: AsyncSession, *, story_id: uuid.UUID, voter_key: str) -> bool:
    result = await db.execute(
        delete(WowFeatureVote)
        .where(WowFeatureVote.story_id == story_id, WowFeatureVote.voter_key == voter_key)
        .returning(WowFeatureVote.id)
    )
    return result.scalar_one_or_none() is not None


async def exists(db: AsyncSession, *, story_id: uuid.UUID, voter_key: str) -> bool:
    found = await db.scalar(
        select(WowFeatureVote.id).where(WowFeatureVote.story_id == story_id, WowFeatureVote.voter_key == voter_key)
    )
    return found is not None


async def count_for_network(db: AsyncSession, *, story_id: uuid.UUID, ip_hash: str) -> int:
    total = await db.scalar(
        select(func.count())
        .select_from(WowFeatureVote)
        .where(WowFeatureVote.story_id == story_id, WowFeatureVote.ip_hash == ip_hash)
    )
    return int(total or 0)


async def voted_story_ids(
    db: AsyncSession, *, voter_key: str, story_ids: Collection[uuid.UUID]
) -> list[uuid.UUID]:
    if not story_ids:
        return []
    rows = await db.execute(
        select(WowFeatureVote.story_id).where(
            WowFeatureVote.voter_key == voter_key, WowFeatureVote.story_id.in_(list(story_ids))
        )
    )
    return list(rows.scalars().all())


async def move_votes(db: AsyncSession, *, from_id: uuid.UUID, to_id: uuid.UUID) -> None:
    """Copy votes onto ``to_id`` (a voter on both keeps one), then drop ``from_id``'s."""
    copied = select(
        func.gen_random_uuid(),
        literal(to_id),
        WowFeatureVote.voter_key,
        WowFeatureVote.ip_hash,
        WowFeatureVote.source,
        WowFeatureVote.created_at,
        WowFeatureVote.updated_at,
    ).where(WowFeatureVote.story_id == from_id)
    await db.execute(
        insert(WowFeatureVote)
        .from_select(
            ["id", "story_id", "voter_key", "ip_hash", "source", "created_at", "updated_at"], copied
        )
        .on_conflict_do_nothing(constraint="uq_wowfeaturevote_story_voter")
    )
    await db.execute(delete(WowFeatureVote).where(WowFeatureVote.story_id == from_id))


async def clear_ip_hash_before(db: AsyncSession, *, before: datetime) -> int:
    result = await db.execute(
        update(WowFeatureVote)
        .where(WowFeatureVote.ip_hash.is_not(None), WowFeatureVote.created_at < before)
        .values(ip_hash=None)
    )
    return int(result.rowcount or 0)
