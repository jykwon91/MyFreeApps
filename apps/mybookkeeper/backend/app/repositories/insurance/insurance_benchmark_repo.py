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

from platform_shared.repositories.audited_writes import delete_rows, upsert_row
from sqlalchemy import select
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

    Through the ORM (``upsert_row``) rather than a dialect-specific
    ``ON CONFLICT``, so the query stays portable to SQLite in tests and the
    audit log records the write. Two writers that both find no row converge on
    an update instead of the loser surfacing as a 500, so the endpoint is
    genuinely idempotent rather than idempotent-if-unraced.
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

    benchmark, _created = await upsert_row(
        db, InsuranceBenchmark,
        InsuranceBenchmark.organization_id == organization_id,
        create={"organization_id": organization_id, **values},
        update=values,
    )
    return benchmark


async def delete_for_org(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> bool:
    return bool(await delete_rows(
        db, InsuranceBenchmark, InsuranceBenchmark.organization_id == organization_id,
    ))
