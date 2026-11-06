"""WowFeatureSubmission repository — ORM operations for ``wow_feature_submission``.

Submissions are PRIVATE; nothing here is for a public read. The caller owns
the transaction; these only flush.
"""
from __future__ import annotations

import uuid
from collections.abc import Collection
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_feature_request_enums import STORY_LINKED_VERDICTS
from app.models.wow.feature_submission import WowFeatureSubmission


def add(db: AsyncSession, values: dict[str, object]) -> WowFeatureSubmission:
    row = WowFeatureSubmission(**values)
    db.add(row)
    return row


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def get(db: AsyncSession, submission_id: uuid.UUID) -> WowFeatureSubmission | None:
    return await db.get(WowFeatureSubmission, submission_id)


async def get_for_update(db: AsyncSession, submission_id: uuid.UUID) -> WowFeatureSubmission | None:
    return await db.scalar(
        select(WowFeatureSubmission).where(WowFeatureSubmission.id == submission_id).with_for_update()
    )


async def has_follow_up(db: AsyncSession, parent_id: uuid.UUID) -> bool:
    found = await db.scalar(
        select(WowFeatureSubmission.id).where(WowFeatureSubmission.parent_submission_id == parent_id).limit(1)
    )
    return found is not None


async def count_untriaged(db: AsyncSession) -> int:
    total = await db.scalar(
        select(func.count()).select_from(WowFeatureSubmission).where(WowFeatureSubmission.triaged_at.is_(None))
    )
    return int(total or 0)


async def find_story_linked_by_fingerprint(
    db: AsyncSession, *, fingerprint: str, since: datetime
) -> WowFeatureSubmission | None:
    """The newest story-linked submission with this text since ``since``."""
    return await db.scalar(
        select(WowFeatureSubmission)
        .where(
            WowFeatureSubmission.text_fingerprint == fingerprint,
            WowFeatureSubmission.verdict.in_(STORY_LINKED_VERDICTS),
            WowFeatureSubmission.created_at >= since,
        )
        .order_by(WowFeatureSubmission.created_at.desc())
        .limit(1)
    )


async def list_untriaged(db: AsyncSession, *, limit: int) -> list[WowFeatureSubmission]:
    rows = await db.execute(
        select(WowFeatureSubmission)
        .where(WowFeatureSubmission.triaged_at.is_(None))
        .order_by(WowFeatureSubmission.created_at, WowFeatureSubmission.id)
        .limit(limit)
    )
    return list(rows.scalars().all())


async def list_for_stories(
    db: AsyncSession, story_ids: Collection[uuid.UUID]
) -> dict[uuid.UUID, list[WowFeatureSubmission]]:
    if not story_ids:
        return {}
    rows = await db.execute(
        select(WowFeatureSubmission)
        .where(WowFeatureSubmission.story_id.in_(list(story_ids)))
        .order_by(WowFeatureSubmission.created_at)
    )
    grouped: dict[uuid.UUID, list[WowFeatureSubmission]] = {}
    for row in rows.scalars().all():
        assert row.story_id is not None
        grouped.setdefault(row.story_id, []).append(row)
    return grouped


async def repoint_story(db: AsyncSession, *, from_id: uuid.UUID, to_id: uuid.UUID) -> int:
    result = await db.execute(
        update(WowFeatureSubmission)
        .where(WowFeatureSubmission.story_id == from_id)
        .values(story_id=to_id)
        .execution_options(synchronize_session="fetch")
    )
    return int(result.rowcount or 0)


async def mark_triaged(db: AsyncSession, submission_ids: Collection[uuid.UUID], *, at: datetime) -> int:
    result = await db.execute(
        update(WowFeatureSubmission)
        .where(WowFeatureSubmission.id.in_(list(submission_ids)), WowFeatureSubmission.triaged_at.is_(None))
        .values(triaged_at=at, updated_at=at)
        .execution_options(synchronize_session="fetch")
    )
    return int(result.rowcount or 0)


# --- Retention ------------------------------------------------------------------


async def delete_unlinked_before(db: AsyncSession, *, verdicts: Collection[str], before: datetime) -> int:
    result = await db.execute(
        delete(WowFeatureSubmission).where(
            WowFeatureSubmission.verdict.in_(list(verdicts)),
            WowFeatureSubmission.story_id.is_(None),
            WowFeatureSubmission.created_at < before,
        )
    )
    return int(result.rowcount or 0)


async def clear_text_triaged_before(db: AsyncSession, *, before: datetime) -> int:
    result = await db.execute(
        update(WowFeatureSubmission)
        .where(
            WowFeatureSubmission.story_id.is_not(None),
            WowFeatureSubmission.triaged_at < before,
            (WowFeatureSubmission.raw_text.is_not(None)) | (WowFeatureSubmission.clarification_answer.is_not(None)),
        )
        .values(raw_text=None, clarification_answer=None)
    )
    return int(result.rowcount or 0)


async def clear_ip_hash_before(db: AsyncSession, *, before: datetime) -> int:
    result = await db.execute(
        update(WowFeatureSubmission)
        .where(WowFeatureSubmission.ip_hash.is_not(None), WowFeatureSubmission.created_at < before)
        .values(ip_hash=None)
    )
    return int(result.rowcount or 0)
