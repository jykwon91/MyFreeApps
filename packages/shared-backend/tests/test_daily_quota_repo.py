"""Tests for ``platform_shared.repositories.daily_quota_repo``."""
import asyncio
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from platform_shared.db.models.daily_usage_counter import DailyUsageCounter
from platform_shared.repositories.daily_quota_repo import (
    get_daily_usage,
    release_daily_quota,
    try_consume_daily_quota,
    try_consume_daily_quota_amount,
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


# ---------------------------------------------------------------------------
# Amount-based consume + release
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_amount_first_insert_over_cap_is_rejected(db: AsyncSession) -> None:
    """ON CONFLICT ... WHERE only guards the UPDATE branch — the very first
    consume of the day must still be checked against the cap."""
    assert not await try_consume_daily_quota_amount(
        db, bucket="b", cap=100, amount=101, day=_DAY,
    )
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 0


@pytest.mark.anyio
async def test_amount_exact_cap_allowed_then_one_more_rejected(db: AsyncSession) -> None:
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=60, day=_DAY)
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=40, day=_DAY)
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 100
    assert not await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=1, day=_DAY)
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 100


@pytest.mark.anyio
async def test_amount_first_insert_exactly_cap_allowed(db: AsyncSession) -> None:
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=50, amount=50, day=_DAY)
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 50


@pytest.mark.anyio
async def test_amount_overflow_is_all_or_nothing(db: AsyncSession) -> None:
    """cap+1 total is refused and nothing is partially consumed."""
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=70, day=_DAY)
    assert not await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=31, day=_DAY)
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 70


@pytest.mark.anyio
@pytest.mark.parametrize("amount", [0, -1, -500])
async def test_amount_non_positive_rejected(db: AsyncSession, amount: int) -> None:
    assert not await try_consume_daily_quota_amount(
        db, bucket="b", cap=100, amount=amount, day=_DAY,
    )
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 0


@pytest.mark.anyio
async def test_amount_zero_cap_never_consumes(db: AsyncSession) -> None:
    assert not await try_consume_daily_quota_amount(db, bucket="b", cap=0, amount=1, day=_DAY)


@pytest.mark.anyio
async def test_release_returns_units_to_the_pool(db: AsyncSession) -> None:
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=100, day=_DAY)
    await release_daily_quota(db, bucket="b", amount=30, day=_DAY)
    db.expire_all()
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 70
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=30, day=_DAY)


@pytest.mark.anyio
async def test_release_floors_at_zero(db: AsyncSession) -> None:
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=10, day=_DAY)
    await release_daily_quota(db, bucket="b", amount=25, day=_DAY)
    db.expire_all()
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 0


@pytest.mark.anyio
async def test_release_only_touches_the_given_day(db: AsyncSession) -> None:
    next_day = date(2026, 9, 23)
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=40, day=_DAY)
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=40, day=next_day)
    await release_daily_quota(db, bucket="b", amount=40, day=_DAY)
    db.expire_all()
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 0
    assert await get_daily_usage(db, bucket="b", today=next_day) == 40


@pytest.mark.anyio
async def test_release_missing_row_is_noop(db: AsyncSession) -> None:
    await release_daily_quota(db, bucket="nope", amount=5, day=_DAY)
    assert await db.get(DailyUsageCounter, ("nope", _DAY)) is None


@pytest.mark.anyio
async def test_release_non_positive_amount_is_noop(db: AsyncSession) -> None:
    assert await try_consume_daily_quota_amount(db, bucket="b", cap=100, amount=10, day=_DAY)
    await release_daily_quota(db, bucket="b", amount=0, day=_DAY)
    await release_daily_quota(db, bucket="b", amount=-5, day=_DAY)
    db.expire_all()
    assert await get_daily_usage(db, bucket="b", today=_DAY) == 10


@pytest.mark.anyio
@pytest.mark.parametrize("cap", [-1, 0, 1, 3])
async def test_unit_consume_matches_amount_one(db: AsyncSession, cap: int) -> None:
    """``try_consume_daily_quota`` is exactly ``amount=1`` of the amount variant."""
    unit = [
        await try_consume_daily_quota(db, bucket="unit", cap=cap, today=_DAY)
        for _ in range(5)
    ]
    amount = [
        await try_consume_daily_quota_amount(db, bucket="amt", cap=cap, amount=1, day=_DAY)
        for _ in range(5)
    ]
    assert unit == amount
    assert unit == [i < cap for i in range(5)]
    assert await get_daily_usage(db, bucket="unit", today=_DAY) == max(cap, 0)
    assert await get_daily_usage(db, bucket="amt", today=_DAY) == max(cap, 0)


@pytest.mark.anyio
async def test_concurrent_reservations_never_exceed_cap(tmp_path: Path) -> None:
    """Many concurrent sessions reserving against one bucket never overshoot.

    The shared test suite has no Postgres, so this runs against a file-backed
    SQLite DB with one session (= one connection) per task. SQLite serialises
    writers with a database lock rather than Postgres's conflicting-row lock,
    so this proves the single-statement check-and-increment has no
    read-modify-write window across interleaved tasks — not Postgres row-lock
    semantics specifically.
    """
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'quota.db'}",
        connect_args={"timeout": 30},
    )
    async with engine.begin() as conn:
        await conn.run_sync(DailyUsageCounter.__table__.create)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    cap, amount, attempts = 100, 7, 40

    async def reserve() -> bool:
        async with session_factory() as session:
            ok = await try_consume_daily_quota_amount(
                session, bucket="c", cap=cap, amount=amount, day=_DAY,
            )
            await session.commit()
            return ok

    try:
        results = await asyncio.gather(*(reserve() for _ in range(attempts)))
        async with session_factory() as session:
            used = await get_daily_usage(session, bucket="c", today=_DAY)
    finally:
        await engine.dispose()

    assert sum(results) == cap // amount
    assert used == (cap // amount) * amount
    assert used <= cap
