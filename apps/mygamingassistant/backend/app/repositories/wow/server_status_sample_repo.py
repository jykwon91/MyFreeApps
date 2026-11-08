"""WowServerStatusSample repository — the recorded server status history.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import zlib
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import and_, delete, func, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.server_status_sample import WowServerStatusSample
from app.repositories.wow.status_streak import StatusStreak

# Advisory-lock namespace (first int of the two-int form) for the recorder.
_LOCK_NAMESPACE = zlib.crc32(b"mga.wow_server_status_sample") & 0x7FFFFFFF


async def try_lock_region(db: AsyncSession, region: str) -> bool:
    """Take this region's recording lock for the rest of the transaction.

    False when another worker holds it — that worker is recording the same
    region, so this one can skip. Released automatically on commit / rollback.
    """
    key = zlib.crc32(region.encode()) & 0x7FFFFFFF
    result = await db.execute(
        text("SELECT pg_try_advisory_xact_lock(:ns, :key)"), {"ns": _LOCK_NAMESPACE, "key": key},
    )
    return bool(result.scalar_one())


async def latest_per_ruleset(db: AsyncSession, region: str) -> dict[str, WowServerStatusSample]:
    """The newest row of each ruleset in ``region``, keyed by ruleset slug."""
    result = await db.execute(
        select(WowServerStatusSample)
        .where(WowServerStatusSample.region == region)
        .distinct(WowServerStatusSample.ruleset)
        .order_by(WowServerStatusSample.ruleset, WowServerStatusSample.observed_at.desc())
    )
    return {row.ruleset: row for row in result.scalars()}


async def latest_before(db: AsyncSession, region: str, before: datetime) -> list[WowServerStatusSample]:
    """Each ruleset's newest row strictly before ``before`` — the status a window opens with."""
    result = await db.execute(
        select(WowServerStatusSample)
        .where(WowServerStatusSample.region == region, WowServerStatusSample.observed_at < before)
        .distinct(WowServerStatusSample.ruleset)
        .order_by(WowServerStatusSample.ruleset, WowServerStatusSample.observed_at.desc())
    )
    return list(result.scalars())


async def list_since(db: AsyncSession, region: str, since: datetime) -> list[WowServerStatusSample]:
    """Every row in ``region`` at or after ``since``, oldest first."""
    result = await db.execute(
        select(WowServerStatusSample)
        .where(WowServerStatusSample.region == region, WowServerStatusSample.observed_at >= since)
        .order_by(WowServerStatusSample.ruleset, WowServerStatusSample.observed_at)
    )
    return list(result.scalars())


async def streaks(db: AsyncSession, region: str) -> dict[str, StatusStreak]:
    """When each ruleset's current status began, as far as the stored rows show.

    The streak starts at the first row after the last row with a different
    status. With no different status on record it starts at the oldest row
    and ``exact`` is False ("up for at least …").
    """
    s = WowServerStatusSample
    latest = (
        select(s.ruleset, s.status)
        .where(s.region == region)
        .distinct(s.ruleset)
        .order_by(s.ruleset, s.observed_at.desc())
        .subquery("latest")
    )
    last_other = (
        select(s.ruleset, func.max(s.observed_at).label("at"))
        .join(latest, and_(latest.c.ruleset == s.ruleset, latest.c.status != s.status))
        .where(s.region == region)
        .group_by(s.ruleset)
        .subquery("last_other")
    )
    result = await db.execute(
        select(
            s.ruleset,
            func.min(s.observed_at).label("since"),
            func.bool_or(last_other.c.at.is_not(None)).label("exact"),
        )
        .outerjoin(last_other, last_other.c.ruleset == s.ruleset)
        .where(s.region == region, (last_other.c.at.is_(None)) | (s.observed_at > last_other.c.at))
        .group_by(s.ruleset)
    )
    return {row.ruleset: StatusStreak(since=row.since, exact=bool(row.exact)) for row in result}


async def add_many(db: AsyncSession, rows: Sequence[dict[str, object]]) -> None:
    if rows:
        await db.execute(insert(WowServerStatusSample), list(rows))


async def delete_before(db: AsyncSession, before: datetime) -> int:
    """Delete every row observed before ``before``; returns how many."""
    result = await db.execute(delete(WowServerStatusSample).where(WowServerStatusSample.observed_at < before))
    return int(result.rowcount or 0)
