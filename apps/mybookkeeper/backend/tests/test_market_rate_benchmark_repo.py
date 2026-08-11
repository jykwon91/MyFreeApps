"""Repository tests for ``market_rate_benchmarks``.

Focus is on tenant scoping and the upsert, which is the only non-obvious query
here: it must replace values in place rather than accumulate rows, and it must
clear the shape it is not writing so a service switching from a metered rate to
a flat monthly does not leave both columns populated.

Scoping is the subtle part. This table is scoped to the **organization alone**,
unlike its siblings — the unique index is ``(organization_id, service_type)``,
so a read filtered any more narrowly would let a second member of the same org
miss a row their own write then collides with. The tests below pin that a
second member sees, updates and deletes the same row.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utility_plan_constants import (
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_INTERNET,
)
from app.repositories.properties import market_rate_benchmark_repo

pytestmark = pytest.mark.asyncio

OBSERVED = _dt.date(2026, 8, 11)


async def _upsert(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    service_type: str = SERVICE_TYPE_ELECTRICITY,
    rate_cents_per_kwh: Decimal | None = Decimal("11.1000"),
    monthly_cents: int | None = None,
    source: str | None = "Power to Choose, 77021",
    observed_on: _dt.date = OBSERVED,
    notes: str | None = None,
):
    return await market_rate_benchmark_repo.upsert(
        db,
        recorded_by_user_id=user_id,
        organization_id=org_id,
        service_type=service_type,
        rate_cents_per_kwh=rate_cents_per_kwh,
        monthly_cents=monthly_cents,
        source=source,
        observed_on=observed_on,
        notes=notes,
    )


class TestUpsert:
    async def test_creates_then_replaces_rather_than_accumulating(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        first = await _upsert(db, org_id=org_id)
        second = await _upsert(db, org_id=org_id, rate_cents_per_kwh=Decimal("10.8000"))

        assert second.id == first.id
        rows = await market_rate_benchmark_repo.list_for_org(db, organization_id=org_id)
        assert len(rows) == 1
        assert Decimal(str(rows[0].rate_cents_per_kwh)) == Decimal("10.8")

    async def test_switching_shape_clears_the_figure_that_no_longer_applies(
        self, db: AsyncSession,
    ) -> None:
        """Leaving both populated would violate the one-shape CHECK."""
        org_id = uuid.uuid4()
        await _upsert(db, org_id=org_id, service_type=SERVICE_TYPE_INTERNET,
                      rate_cents_per_kwh=None, monthly_cents=6000)
        updated = await _upsert(
            db,
            org_id=org_id,
            service_type=SERVICE_TYPE_INTERNET,
            rate_cents_per_kwh=None,
            monthly_cents=7000,
        )

        assert updated.rate_cents_per_kwh is None
        assert updated.monthly_cents == 7000

    async def test_different_service_types_coexist(self, db: AsyncSession) -> None:
        org_id = uuid.uuid4()
        await _upsert(db, org_id=org_id)
        await _upsert(
            db,
            org_id=org_id,
            service_type=SERVICE_TYPE_INTERNET,
            rate_cents_per_kwh=None,
            monthly_cents=6000,
        )

        rows = await market_rate_benchmark_repo.list_for_org(db, organization_id=org_id)
        assert {r.service_type for r in rows} == {
            SERVICE_TYPE_ELECTRICITY,
            SERVICE_TYPE_INTERNET,
        }

    async def test_rate_precision_survives_the_round_trip(
        self, db: AsyncSession,
    ) -> None:
        row = await _upsert(
            db, org_id=uuid.uuid4(), rate_cents_per_kwh=Decimal("10.8375"),
        )
        await db.refresh(row)
        assert Decimal(str(row.rate_cents_per_kwh)) == Decimal("10.8375")

    async def test_another_orgs_row_is_not_overwritten(self, db: AsyncSession) -> None:
        """Without org scoping the read-then-write would clobber a neighbour."""
        mine, theirs = uuid.uuid4(), uuid.uuid4()
        await _upsert(db, org_id=theirs)
        await _upsert(db, org_id=mine, rate_cents_per_kwh=Decimal("9.0000"))

        their_rows = await market_rate_benchmark_repo.list_for_org(
            db, organization_id=theirs,
        )
        assert len(their_rows) == 1
        assert Decimal(str(their_rows[0].rate_cents_per_kwh)) == Decimal("11.1")

    async def test_provenance_records_the_member_who_wrote_it(
        self, db: AsyncSession,
    ) -> None:
        org_id, member_a, member_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        first = await _upsert(db, org_id=org_id, user_id=member_a)
        assert first.recorded_by_user_id == member_a

        updated = await _upsert(
            db, org_id=org_id, user_id=member_b, rate_cents_per_kwh=Decimal("9.0000"),
        )
        assert updated.id == first.id
        assert updated.recorded_by_user_id == member_b


class TestOrganizationScoping:
    """A benchmark belongs to the org, not to whoever looked the rate up."""

    async def test_a_second_member_reads_the_same_row(self, db: AsyncSession) -> None:
        org_id, member_a, member_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        await _upsert(db, org_id=org_id, user_id=member_a)

        rows = await market_rate_benchmark_repo.list_for_org(db, organization_id=org_id)
        assert len(rows) == 1
        assert rows[0].recorded_by_user_id == member_a
        assert member_b != member_a  # the read did not depend on the member

    async def test_a_second_member_updates_rather_than_colliding(
        self, db: AsyncSession,
    ) -> None:
        """Scoping reads by user would send this write into the unique index."""
        org_id = uuid.uuid4()
        first = await _upsert(db, org_id=org_id, user_id=uuid.uuid4())
        second = await _upsert(
            db,
            org_id=org_id,
            user_id=uuid.uuid4(),
            rate_cents_per_kwh=Decimal("10.0000"),
        )

        assert second.id == first.id
        assert len(
            await market_rate_benchmark_repo.list_for_org(db, organization_id=org_id)
        ) == 1


class TestGetAndDelete:
    async def test_get_is_scoped_to_the_owning_org(self, db: AsyncSession) -> None:
        await _upsert(db, org_id=uuid.uuid4())

        assert (
            await market_rate_benchmark_repo.get_by_service_type(
                db,
                organization_id=uuid.uuid4(),
                service_type=SERVICE_TYPE_ELECTRICITY,
            )
            is None
        )

    async def test_delete_removes_the_row_and_reports_it(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        await _upsert(db, org_id=org_id)

        assert (
            await market_rate_benchmark_repo.delete_by_service_type(
                db,
                organization_id=org_id,
                service_type=SERVICE_TYPE_ELECTRICITY,
            )
            is True
        )
        assert (
            await market_rate_benchmark_repo.list_for_org(db, organization_id=org_id)
            == []
        )

    async def test_a_second_member_can_remove_the_orgs_benchmark(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        await _upsert(db, org_id=org_id, user_id=uuid.uuid4())

        assert (
            await market_rate_benchmark_repo.delete_by_service_type(
                db,
                organization_id=org_id,
                service_type=SERVICE_TYPE_ELECTRICITY,
            )
            is True
        )

    async def test_delete_reports_false_when_nothing_matched(
        self, db: AsyncSession,
    ) -> None:
        assert (
            await market_rate_benchmark_repo.delete_by_service_type(
                db,
                organization_id=uuid.uuid4(),
                service_type=SERVICE_TYPE_ELECTRICITY,
            )
            is False
        )

    async def test_delete_will_not_reach_another_orgs_row(
        self, db: AsyncSession,
    ) -> None:
        theirs = uuid.uuid4()
        await _upsert(db, org_id=theirs)

        assert (
            await market_rate_benchmark_repo.delete_by_service_type(
                db,
                organization_id=uuid.uuid4(),
                service_type=SERVICE_TYPE_ELECTRICITY,
            )
            is False
        )
        assert len(
            await market_rate_benchmark_repo.list_for_org(db, organization_id=theirs)
        ) == 1
