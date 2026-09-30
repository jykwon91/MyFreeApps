"""Durable global daily quota — atomic "consume N units if it fits under the cap".

Use for cost-bearing endpoints reachable by the public (anonymous Claude calls,
paid third-party lookups) where a per-IP ``RateLimiter`` alone doesn't bound
total spend: many IPs x per-IP limit is still unbounded, and an in-process
limiter resets on every restart / is per-worker.

The consume is ONE statement:

    INSERT INTO daily_usage_counters (bucket, day, count) VALUES (:b, :d, :amount)
    ON CONFLICT (bucket, day) DO UPDATE SET count = count + :amount
        WHERE daily_usage_counters.count + :amount <= :cap
    RETURNING count

When the row can't absorb ``amount`` the ``WHERE`` suppresses the update and
nothing is returned, so the check-and-increment is atomic under concurrency
(row lock on the conflicting row) with no read-modify-write race.

The ``ON CONFLICT ... WHERE`` only guards the UPDATE branch — a first INSERT
of the day is never checked against ``cap``. ``amount <= cap`` is therefore
verified in Python before the statement runs, which makes the first insert
safe too (an empty day can always take any ``amount <= cap``).

Two shapes of caller:

* Unit-counted (one request = one unit): ``try_consume_daily_quota``.
* Amount-counted (e.g. Claude token spend): reserve an upper-bound estimate
  with ``try_consume_daily_quota_amount`` before the call, then hand back the
  unused part with ``release_daily_quota`` afterwards. Pass the SAME ``day``
  to both (capture ``utc_today()`` once) so a reservation made at 23:59:59 UTC
  is not "released" against the next day's row.

The caller commits. Callers should consume AFTER cheap validation (so rejected
input doesn't burn quota) and BEFORE the expensive call.
"""
from datetime import date, datetime, timezone

from sqlalchemy import case, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.db.models.daily_usage_counter import DailyUsageCounter


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


async def try_consume_daily_quota_amount(
    db: AsyncSession,
    *,
    bucket: str,
    cap: int,
    amount: int,
    day: date | None = None,
) -> bool:
    """Consume ``amount`` units of ``bucket``'s quota for ``day`` (default: today UTC).

    Returns True if the whole ``amount`` was consumed (``count + amount <= cap``),
    False otherwise — a refused consume changes nothing (no partial consume).
    ``amount <= 0`` or ``amount > cap`` always returns False; so does
    ``cap <= 0`` (feature off). Does NOT commit — the caller owns the transaction.
    """
    if amount <= 0 or amount > cap:
        return False
    target_day = day or utc_today()
    dialect = db.bind.dialect.name
    insert_fn = sqlite_insert if dialect == "sqlite" else pg_insert
    table = DailyUsageCounter.__table__
    now = datetime.now(timezone.utc)
    stmt = insert_fn(table).values(
        bucket=bucket, day=target_day, count=amount, updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.bucket, table.c.day],
        set_={"count": table.c.count + amount, "updated_at": now},
        where=table.c.count + amount <= cap,
    ).returning(table.c.count)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


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
    return await try_consume_daily_quota_amount(
        db, bucket=bucket, cap=cap, amount=1, day=today,
    )


async def release_daily_quota(
    db: AsyncSession,
    *,
    bucket: str,
    amount: int,
    day: date,
) -> None:
    """Give ``amount`` units back to ``bucket`` on ``day``, flooring at 0.

    For refunding the unused part of a reservation (estimate - actual) or a
    reservation whose call failed. ``day`` is required: it must be the day the
    reservation was made against. No-op when the row doesn't exist or
    ``amount <= 0``. Does NOT commit — the caller owns the transaction.
    """
    if amount <= 0:
        return
    table = DailyUsageCounter.__table__
    remaining = table.c.count - amount
    stmt = (
        update(table)
        .where(table.c.bucket == bucket, table.c.day == day)
        .values(
            count=case((remaining < 0, 0), else_=remaining),
            updated_at=datetime.now(timezone.utc),
        )
    )
    await db.execute(stmt)


async def get_daily_usage(
    db: AsyncSession, *, bucket: str, today: date | None = None,
) -> int:
    """Current count for ``bucket`` on ``today`` (UTC); 0 when no row yet."""
    row = await db.get(DailyUsageCounter, (bucket, today or utc_today()))
    return row.count if row is not None else 0
