"""Repository for ``insurance_benchmarks``.

Scoped by ``organization_id`` alone — see the model docstring. The insurance
policy tables scope by ``(user_id, organization_id)``; this one must not,
because its unique index is ``(organization_id)`` and a narrower read filter
would let one member's write collide with a row they cannot see.

No soft delete: a benchmark is a snapshot the operator can overwrite or remove.
A tombstone would leave two rows competing to describe one market, which the
unique index exists to prevent.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import delete, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insurance.insurance_benchmark import InsuranceBenchmark


async def get_for_org(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> InsuranceBenchmark | None:
    result = await db.execute(
        select(InsuranceBenchmark).where(
            InsuranceBenchmark.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


def _apply_values(
    benchmark: InsuranceBenchmark,
    *,
    recorded_by_user_id: uuid.UUID | None,
    annual_premium_cents: int,
    coverage_amount_cents: int,
    region_label: str | None,
    source: str | None,
    observed_on: _dt.date,
    notes: str | None,
) -> None:
    benchmark.recorded_by_user_id = recorded_by_user_id
    benchmark.annual_premium_cents = annual_premium_cents
    benchmark.coverage_amount_cents = coverage_amount_cents
    benchmark.region_label = region_label
    benchmark.source = source
    benchmark.observed_on = observed_on
    benchmark.notes = notes


async def upsert(
    db: AsyncSession,
    *,
    recorded_by_user_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    annual_premium_cents: int,
    coverage_amount_cents: int,
    region_label: str | None,
    source: str | None,
    observed_on: _dt.date,
    notes: str | None,
) -> InsuranceBenchmark:
    """Create the org's benchmark, or replace its values.

    Read-then-write rather than a dialect-specific ``ON CONFLICT``, so the query
    stays portable to SQLite in tests like the rest of this package. The insert
    is wrapped in a SAVEPOINT and the unique-index violation is caught: two
    writers that both miss on the read converge on an update instead of the
    loser surfacing as a 500. That makes the endpoint genuinely idempotent
    rather than idempotent-if-unraced.
    """
    values = {
        "recorded_by_user_id": recorded_by_user_id,
        "annual_premium_cents": annual_premium_cents,
        "coverage_amount_cents": coverage_amount_cents,
        "region_label": region_label,
        "source": source,
        "observed_on": observed_on,
        "notes": notes,
    }

    existing = await get_for_org(db, organization_id=organization_id)
    if existing is not None:
        _apply_values(existing, **values)
        await db.flush()
        return existing

    benchmark = InsuranceBenchmark(organization_id=organization_id, **values)
    try:
        async with db.begin_nested():
            db.add(benchmark)
            await db.flush()
    except IntegrityError:
        # Another writer inserted this org's row between our read and our
        # write. The SAVEPOINT rolled back, so the session is usable: re-read
        # the winner and apply our values on top.
        #
        # The rollback usually evicts the pending instance itself, in which
        # case expunging again raises InvalidRequestError — and that exception
        # would replace the IntegrityError we are handling, turning a recovered
        # race into a 500. Only expunge if it is still attached.
        if inspect(benchmark).session_id is not None:
            db.expunge(benchmark)
        winner = await get_for_org(db, organization_id=organization_id)
        if winner is None:
            # The violation was not the unique index — surface it rather than
            # swallowing a genuine constraint failure as a silent no-op.
            raise
        _apply_values(winner, **values)
        await db.flush()
        return winner
    return benchmark


async def delete_for_org(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        delete(InsuranceBenchmark).where(
            InsuranceBenchmark.organization_id == organization_id,
        )
    )
    return (result.rowcount or 0) > 0
