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

from platform_shared.repositories.audited_writes import delete_rows, upsert_row
from sqlalchemy import Select, select
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

    Through the ORM (``upsert_row``) rather than a dialect-specific
    ``ON CONFLICT``, so the query stays portable to SQLite in tests and the
    audit log records the write. Two writers that both find no row converge on
    an update instead of the loser surfacing as a 500, so the endpoint is
    genuinely idempotent rather than idempotent-if-unraced.

    Both rate shapes are written, not just the populated one: switching a
    service from a metered rate to a flat monthly must clear the figure that no
    longer applies, or the CHECK would reject the write.
    """
    values = {
        "recorded_by_user_id": recorded_by_user_id,
        "rate_cents_per_kwh": rate_cents_per_kwh,
        "monthly_cents": monthly_cents,
        "source": source,
        "observed_on": observed_on,
        "notes": notes,
    }

    benchmark, _created = await upsert_row(
        db, MarketRateBenchmark,
        MarketRateBenchmark.organization_id == organization_id,
        MarketRateBenchmark.service_type == service_type,
        create={"organization_id": organization_id, "service_type": service_type, **values},
        update=values,
    )
    return benchmark


async def delete_by_service_type(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    service_type: str,
) -> bool:
    return bool(await delete_rows(
        db,
        MarketRateBenchmark,
        MarketRateBenchmark.organization_id == organization_id,
        MarketRateBenchmark.service_type == service_type,
    ))
