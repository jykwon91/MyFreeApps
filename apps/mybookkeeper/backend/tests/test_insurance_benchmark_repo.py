"""Repository-level tests for ``insurance_benchmarks``.

Two things are worth pinning here that the service tests cannot see: the
singleton-per-organization invariant the unique index enforces, and the
race-loser path in ``upsert`` — the branch that turns a concurrent insert from
a 500 into a second update.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insurance.insurance_benchmark import InsuranceBenchmark
from app.repositories.insurance import insurance_benchmark_repo

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 8, 13)


async def _upsert(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    user_id: uuid.UUID | None = None,
    annual_premium_cents: int = 120_000,
    coverage_amount_cents: int = 40_000_000,
    source: str | None = "TDI HelpInsure",
) -> InsuranceBenchmark:
    return await insurance_benchmark_repo.upsert(
        db,
        recorded_by_user_id=user_id,
        organization_id=org_id,
        annual_premium_cents=annual_premium_cents,
        coverage_amount_cents=coverage_amount_cents,
        region_label="Harris County, TX",
        source=source,
        observed_on=TODAY,
        notes=None,
    )


class TestUpsert:
    async def test_creates_when_absent(self, db: AsyncSession) -> None:
        org_id = uuid.uuid4()
        saved = await _upsert(db, org_id)

        assert saved.organization_id == org_id
        assert saved.annual_premium_cents == 120_000
        assert await insurance_benchmark_repo.get_for_org(
            db, organization_id=org_id,
        ) is not None

    async def test_second_write_updates_rather_than_inserting(
        self, db: AsyncSession,
    ) -> None:
        """One benchmark per organization — a second row would leave two
        figures competing to describe the same market."""
        org_id = uuid.uuid4()
        first = await _upsert(db, org_id)
        second = await _upsert(db, org_id, annual_premium_cents=150_000)

        assert second.id == first.id
        rows = (
            await db.execute(
                select(InsuranceBenchmark).where(
                    InsuranceBenchmark.organization_id == org_id,
                ),
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].annual_premium_cents == 150_000

    async def test_a_racing_insert_converges_on_an_update(
        self, db: AsyncSession,
    ) -> None:
        """Simulates the loser of a concurrent write: the row appears between
        the read and the insert. The SAVEPOINT catches the unique violation and
        the caller ends up updating the winner instead of seeing a 500."""
        org_id = uuid.uuid4()
        real_get = insurance_benchmark_repo.get_for_org
        calls = {"n": 0}

        async def _get_missing_first(db_arg, *, organization_id):
            # First read reports "absent" even though the row is about to exist;
            # later reads (including the post-IntegrityError re-read) tell the
            # truth.
            calls["n"] += 1
            if calls["n"] == 1:
                return None
            return await real_get(db_arg, organization_id=organization_id)

        # The winner's row, already committed by the other writer.
        await _upsert(db, org_id, source="Winner")

        insurance_benchmark_repo.get_for_org = _get_missing_first  # type: ignore[assignment]
        try:
            result = await _upsert(db, org_id, source="Loser", annual_premium_cents=99_000)
        finally:
            insurance_benchmark_repo.get_for_org = real_get  # type: ignore[assignment]

        assert result.source == "Loser"
        assert result.annual_premium_cents == 99_000
        rows = (
            await db.execute(
                select(InsuranceBenchmark).where(
                    InsuranceBenchmark.organization_id == org_id,
                ),
            )
        ).scalars().all()
        assert len(rows) == 1

    async def test_organizations_do_not_share_a_benchmark(
        self, db: AsyncSession,
    ) -> None:
        org_a, org_b = uuid.uuid4(), uuid.uuid4()
        await _upsert(db, org_a, annual_premium_cents=120_000)
        await _upsert(db, org_b, annual_premium_cents=200_000)

        a = await insurance_benchmark_repo.get_for_org(db, organization_id=org_a)
        b = await insurance_benchmark_repo.get_for_org(db, organization_id=org_b)
        assert a is not None and b is not None
        assert a.annual_premium_cents == 120_000
        assert b.annual_premium_cents == 200_000


class TestDeleteForOrg:
    async def test_reports_whether_anything_was_removed(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        await _upsert(db, org_id)

        assert await insurance_benchmark_repo.delete_for_org(
            db, organization_id=org_id,
        ) is True
        # The second call has nothing to remove — the service turns this into
        # a 404 rather than reporting a delete that did not happen.
        assert await insurance_benchmark_repo.delete_for_org(
            db, organization_id=org_id,
        ) is False

    async def test_does_not_touch_another_organizations_row(
        self, db: AsyncSession,
    ) -> None:
        org_a, org_b = uuid.uuid4(), uuid.uuid4()
        await _upsert(db, org_a)
        await _upsert(db, org_b)

        await insurance_benchmark_repo.delete_for_org(db, organization_id=org_a)
        assert await insurance_benchmark_repo.get_for_org(
            db, organization_id=org_b,
        ) is not None
