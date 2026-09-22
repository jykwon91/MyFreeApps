"""Durable global daily quota — atomic "consume one unit if under the cap".

Use for cost-bearing endpoints reachable by the public (anonymous Claude calls,
paid third-party lookups) where a per-IP ``RateLimiter`` alone doesn't bound
total spend: many IPs x per-IP limit is still unbounded, and an in-process
limiter resets on every restart / is per-worker.

The consume is ONE statement:

    INSERT INTO daily_usage_counters (bucket, day, count) VALUES (:b, :d, 1)
    ON CONFLICT (bucket, day) DO UPDATE SET count = count + 1
        WHERE daily_usage_counters.count < :cap
    RETURNING count

When the row is already at the cap the ``WHERE`` suppresses the update and
nothing is returned, so the check-and-increment is atomic under concurrency
(row lock on the conflicting row) with no read-modify-write race.

The caller commits. Callers should consume AFTER cheap validation (so rejected
input doesn't burn quota) and BEFORE the expensive call.
"""
from datetime import date, datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.db.models.daily_usage_counter import DailyUsageCounter


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


async def try_consume_daily_quota(
    db: AsyncSession,
    *,
    bucket: str,
    cap: int,
    today: date | None = None,
) -> bool:
    """Consume one unit of ``bucket``'s quota for ``today`` (UTC).

    Returns True if the unit was consumed (count was below ``cap``), False if
    the cap is already reached. ``cap <= 0`` always returns False (feature off).
    Does NOT commit — the caller owns the transaction.
    """
    if cap <= 0:
        return False
    day = today or utc_today()
    dialect = db.bind.dialect.name
    insert_fn = sqlite_insert if dialect == "sqlite" else pg_insert
    table = DailyUsageCounter.__table__
    stmt = insert_fn(table).values(
        bucket=bucket, day=day, count=1, updated_at=datetime.now(timezone.utc),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.bucket, table.c.day],
        set_={
            "count": table.c.count + 1,
            "updated_at": datetime.now(timezone.utc),
        },
        where=table.c.count < cap,
    ).returning(table.c.count)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def get_daily_usage(
    db: AsyncSession, *, bucket: str, today: date | None = None,
) -> int:
    """Current count for ``bucket`` on ``today`` (UTC); 0 when no row yet."""
    row = await db.get(DailyUsageCounter, (bucket, today or utc_today()))
    return row.count if row is not None else 0
