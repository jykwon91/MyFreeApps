"""Tests for ``platform_shared.repositories.daily_quota_repo``."""
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.db.models.daily_usage_counter import DailyUsageCounter  # noqa: F401
from platform_shared.repositories.daily_quota_repo import (
    get_daily_usage,
    try_consume_daily_quota,
)

_DAY = date(2026, 9, 22)


@pytest.mark.anyio
async def test_consumes_until_cap_then_refuses(db: AsyncSession) -> None:
    results = [
        await try_consume_daily_quota(db, bucket="b", cap=3, today=_DAY)
        for _ in range(5)
    ]
    assert results == [True, True, True, False, False]
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 3


@pytest.mark.anyio
async def test_buckets_and_days_are_independent(db: AsyncSession) -> None:
    assert await try_consume_daily_quota(db, bucket="a", cap=1, today=_DAY)
    assert not await try_consume_daily_quota(db, bucket="a", cap=1, today=_DAY)
    # Different bucket, same day.
    assert await try_consume_daily_quota(db, bucket="other", cap=1, today=_DAY)
    # Same bucket, next day — the cap resets.
    assert await try_consume_daily_quota(db, bucket="a", cap=1, today=date(2026, 9, 23))


@pytest.mark.anyio
async def test_zero_or_negative_cap_never_consumes(db: AsyncSession) -> None:
    assert not await try_consume_daily_quota(db, bucket="b", cap=0, today=_DAY)
    assert not await try_consume_daily_quota(db, bucket="b", cap=-1, today=_DAY)
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 0


@pytest.mark.anyio
async def test_count_persists_across_commits(db: AsyncSession) -> None:
    """The counter is DB state, not process memory — a commit + fresh read
    sees it (stand-in for "survives a restart / another worker")."""
    assert await try_consume_daily_quota(db, bucket="b", cap=2, today=_DAY)
    await db.commit()
    db.expire_all()
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 1
    assert await try_consume_daily_quota(db, bucket="b", cap=2, today=_DAY)
    assert not await try_consume_daily_quota(db, bucket="b", cap=2, today=_DAY)
