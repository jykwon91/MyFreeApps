"""Repository for ``market_rate_benchmarks``.

Scoped by ``organization_id`` alone — see the model docstring. Every other
utility table here scopes by ``(user_id, organization_id)``; this one must not,
because its unique index is ``(organization_id, service_type)`` and a narrower
read filter would let one member's write collide with a row they cannot see.

No soft delete: a benchmark is a snapshot the operator can simply overwrite or
remove. Keeping a tombstone would leave two rows competing to describe one
market, which the unique index exists to prevent.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import Select, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.market_rate_benchmark import MarketRateBenchmark


def _scope(stmt: Select, *, organization_id: uuid.UUID) -> Select:
    return stmt.where(MarketRateBenchmark.organization_id == organization_id)


async def get_by_service_type(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    service_type: str,
) -> MarketRateBenchmark | None:
    stmt = _scope(
        select(MarketRateBenchmark).where(
            MarketRateBenchmark.service_type == service_type,
        ),
        organization_id=organization_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> list[MarketRateBenchmark]:
    """Every benchmark for the org.

    Unpaginated: the unique index caps this at one row per service type, so the
    result can never outgrow the number of service types the app supports.
    """
    stmt = _scope(
        select(MarketRateBenchmark),
        organization_id=organization_id,
    ).order_by(MarketRateBenchmark.service_type)
    result = await db.execute(stmt)
    return list(result.scalars().all())


def _apply_values(
    benchmark: MarketRateBenchmark,
    *,
    recorded_by_user_id: uuid.UUID | None,
    rate_cents_per_kwh: Decimal | None,
    monthly_cents: int | None,
    source: str | None,
    observed_on: _dt.date,
    notes: str | None,
) -> None:
    # Both shapes are assigned, not just the populated one: switching a service
    # from a metered rate to a flat monthly must clear the figure that no longer
    # applies, or the CHECK would reject the write.
    benchmark.recorded_by_user_id = recorded_by_user_id
    benchmark.rate_cents_per_kwh = rate_cents_per_kwh
    benchmark.monthly_cents = monthly_cents
    benchmark.source = source
    benchmark.observed_on = observed_on
    benchmark.notes = notes


async def upsert(
    db: AsyncSession,
    *,
    recorded_by_user_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    service_type: str,
    rate_cents_per_kwh: Decimal | None,
    monthly_cents: int | None,
    source: str | None,
    observed_on: _dt.date,
    notes: str | None,
) -> MarketRateBenchmark:
    """Create the org's benchmark for ``service_type``, or replace its values.

    Read-then-write rather than a dialect-specific ``ON CONFLICT``, so the query
    stays portable to SQLite in tests like the rest of this package. The insert
    is wrapped in a SAVEPOINT and the unique-index violation is caught: two
    writers that both miss on the read converge on an update instead of the
    loser surfacing as a 500. Portable to both dialects, and it makes the
    endpoint genuinely idempotent rather than idempotent-if-unraced.
    """
    values = {
        "recorded_by_user_id": recorded_by_user_id,
        "rate_cents_per_kwh": rate_cents_per_kwh,
        "monthly_cents": monthly_cents,
        "source": source,
        "observed_on": observed_on,
        "notes": notes,
    }

    existing = await get_by_service_type(
        db, organization_id=organization_id, service_type=service_type,
    )
    if existing is not None:
        _apply_values(existing, **values)
        await db.flush()
        return existing

    benchmark = MarketRateBenchmark(
        organization_id=organization_id,
        service_type=service_type,
        **values,
    )
    try:
        async with db.begin_nested():
            db.add(benchmark)
            await db.flush()
    except IntegrityError:
        # Another writer inserted this org's row between our read and our
        # write. The SAVEPOINT rolled back, so the session is usable: re-read
        # the winner and apply our values on top.
        db.expunge(benchmark)
        winner = await get_by_service_type(
            db, organization_id=organization_id, service_type=service_type,
        )
        if winner is None:
            # The violation was not the unique index — surface it rather than
            # swallowing a genuine constraint failure as a silent no-op.
            raise
        _apply_values(winner, **values)
        await db.flush()
        return winner
    return benchmark


async def delete_by_service_type(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    service_type: str,
) -> bool:
    result = await db.execute(
        delete(MarketRateBenchmark).where(
            MarketRateBenchmark.organization_id == organization_id,
            MarketRateBenchmark.service_type == service_type,
        )
    )
    return (result.rowcount or 0) > 0
