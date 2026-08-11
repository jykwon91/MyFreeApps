"""Tests for the rate-comparison service.

The arithmetic itself is covered in ``test_market_benchmark_compare.py``. What
these pin is the orchestration around it: which plans get measured (current
ones only), how unmeasurable plans are surfaced rather than dropped, and the
ordering that puts the most expensive mistake first.

The service opens its own session via ``unit_of_work()``; ``_make_fake_uow``
patches it to yield the in-memory SQLite test session instead.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.market_benchmark_constants import (
    BENCHMARK_STALE_AFTER_DAYS,
    BENCHMARK_STATUS_NOT_COMPARABLE,
    BENCHMARK_STATUS_NO_BENCHMARK,
)
from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    RATE_TYPE_REGULATED,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_INTERNET,
    SERVICE_TYPE_NATURAL_GAS,
)
from app.models.properties.property import Property
from app.repositories.properties import market_rate_benchmark_repo, utility_plan_repo
from app.services.properties import market_rate_benchmark_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 8, 11)

_UOW_TARGET = "app.services.properties.market_rate_benchmark_service.unit_of_work"


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, name: str,
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        address=name,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _make_plan(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    service_type: str = SERVICE_TYPE_ELECTRICITY,
    provider_name: str = "Reliant",
    rate_type: str = RATE_TYPE_FIXED,
    **kwargs: object,
):
    return await utility_plan_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        property_id=property_id,
        service_type=service_type,
        provider_name=provider_name,
        rate_type=rate_type,
        **kwargs,  # type: ignore[arg-type]
    )


async def _make_benchmark(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    service_type: str = SERVICE_TYPE_ELECTRICITY,
    rate_cents_per_kwh: Decimal | None = Decimal("11.1000"),
    monthly_cents: int | None = None,
    observed_on: _dt.date = TODAY,
):
    return await market_rate_benchmark_repo.upsert(
        db,
        recorded_by_user_id=user_id,
        organization_id=org_id,
        service_type=service_type,
        rate_cents_per_kwh=rate_cents_per_kwh,
        monthly_cents=monthly_cents,
        source="Power to Choose, 77021, 12-month fixed, 4★+",
        observed_on=observed_on,
        notes=None,
    )


class TestGetRateComparison:
    async def test_flags_a_plan_priced_above_the_market(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            avg_price_cents_per_kwh_at_1000=Decimal("15.0600"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(db, org_id=org_id, user_id=user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.total_above_market == 1
        row = result.above_market[0]
        assert row.plan.property_name == "6732 Peerless St"
        assert row.gap_pct == Decimal("35.7")
        assert result.has_stale_benchmark is False

    async def test_a_well_priced_plan_appears_in_neither_list(
        self, db: AsyncSession,
    ) -> None:
        """At-or-below is the quiet case — nothing for the operator to do."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            avg_price_cents_per_kwh_at_1000=Decimal("10.5000"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(db, org_id=org_id, user_id=user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.above_market == []
        assert result.not_compared == []

    async def test_superseded_plans_are_not_measured(self, db: AsyncSession) -> None:
        """An old plan's price is history; flagging it would be noise."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            provider_name="Old and expensive",
            avg_price_cents_per_kwh_at_1000=Decimal("22.0000"),
            service_start_date=_dt.date(2024, 1, 1),
        )
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            provider_name="Current",
            avg_price_cents_per_kwh_at_1000=Decimal("10.5000"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(db, org_id=org_id, user_id=user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.above_market == []

    async def test_plan_without_a_benchmark_is_surfaced_not_dropped(
        self, db: AsyncSession,
    ) -> None:
        """Silence would read as an all-clear the app has not earned."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            avg_price_cents_per_kwh_at_1000=Decimal("15.0600"),
            service_start_date=_dt.date(2026, 2, 17),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.above_market == []
        assert [r.status for r in result.not_compared] == [BENCHMARK_STATUS_NO_BENCHMARK]

    async def test_regulated_plan_is_reported_as_not_comparable(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
            provider_name="CenterPoint",
            rate_type=RATE_TYPE_REGULATED,
            avg_price_cents_per_kwh_at_1000=Decimal("99.0000"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(
            db,
            org_id=org_id,
            user_id=user_id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.above_market == []
        assert [r.status for r in result.not_compared] == [
            BENCHMARK_STATUS_NOT_COMPARABLE,
        ]

    async def test_benchmarks_are_matched_by_service_type(
        self, db: AsyncSession,
    ) -> None:
        """An electricity rate must never be measured against an internet one."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_INTERNET,
            provider_name="AT&T",
            monthly_base_charge_cents=8000,
            equipment_fee_monthly_cents=1000,
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(db, org_id=org_id, user_id=user_id)
        await _make_benchmark(
            db,
            org_id=org_id,
            user_id=user_id,
            service_type=SERVICE_TYPE_INTERNET,
            rate_cents_per_kwh=None,
            monthly_cents=6000,
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.total_above_market == 1
        assert result.above_market[0].plan_figure == Decimal(9000)
        assert result.above_market[0].benchmark_figure == Decimal(6000)

    async def test_widest_gap_sorts_first(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        cheap = await _make_property(db, org_id, user_id, "6732 Peerless St")
        dear = await _make_property(db, org_id, user_id, "6734 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=cheap.id,
            avg_price_cents_per_kwh_at_1000=Decimal("13.0000"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=dear.id,
            avg_price_cents_per_kwh_at_1000=Decimal("16.2700"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(db, org_id=org_id, user_id=user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert [r.plan.property_name for r in result.above_market] == [
            "6734 Peerless St",
            "6732 Peerless St",
        ]

    async def test_stale_benchmark_is_reported_on_the_payload(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            avg_price_cents_per_kwh_at_1000=Decimal("15.0600"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(
            db,
            org_id=org_id,
            user_id=user_id,
            observed_on=TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.has_stale_benchmark is True
        assert result.above_market[0].benchmark_is_stale is True

    async def test_another_orgs_plans_are_not_measured(
        self, db: AsyncSession,
    ) -> None:
        user_id = uuid.uuid4()
        mine, theirs = uuid.uuid4(), uuid.uuid4()
        their_prop = await _make_property(db, theirs, user_id, "Someone else's")
        await _make_plan(
            db,
            org_id=theirs,
            user_id=user_id,
            property_id=their_prop.id,
            avg_price_cents_per_kwh_at_1000=Decimal("15.0600"),
            service_start_date=_dt.date(2026, 2, 17),
        )
        await _make_benchmark(db, org_id=mine, user_id=user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await market_rate_benchmark_service.get_rate_comparison(
                user_id=user_id, organization_id=mine, today=TODAY,
            )

        assert result.above_market == []
        assert result.not_compared == []


class TestBenchmarkCrud:
    async def test_upsert_then_list_round_trips(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            await market_rate_benchmark_service.upsert_benchmark(
                user_id=user_id,
                organization_id=org_id,
                service_type=SERVICE_TYPE_ELECTRICITY,
                rate_cents_per_kwh=Decimal("10.8000"),
                monthly_cents=None,
                source="Power to Choose",
                observed_on=TODAY,
                notes=None,
                today=TODAY,
            )
            rows = await market_rate_benchmark_service.list_benchmarks(
                organization_id=org_id, today=TODAY,
            )

        assert len(rows) == 1
        assert rows[0].is_stale is False
        assert Decimal(str(rows[0].rate_cents_per_kwh)) == Decimal("10.8")

    async def test_a_second_member_of_the_org_sees_the_same_benchmark(
        self, db: AsyncSession,
    ) -> None:
        """The market is a fact about the org, not about who looked it up."""
        org_id, member_a, member_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            await market_rate_benchmark_service.upsert_benchmark(
                user_id=member_a,
                organization_id=org_id,
                service_type=SERVICE_TYPE_ELECTRICITY,
                rate_cents_per_kwh=Decimal("10.8000"),
                monthly_cents=None,
                source="Power to Choose",
                observed_on=TODAY,
                notes=None,
                today=TODAY,
            )
            # Member B updates it: one row, replaced — not a second row that
            # would collide with the (organization, service type) unique index.
            await market_rate_benchmark_service.upsert_benchmark(
                user_id=member_b,
                organization_id=org_id,
                service_type=SERVICE_TYPE_ELECTRICITY,
                rate_cents_per_kwh=Decimal("9.5000"),
                monthly_cents=None,
                source="Power to Choose",
                observed_on=TODAY,
                notes=None,
                today=TODAY,
            )
            rows = await market_rate_benchmark_service.list_benchmarks(
                organization_id=org_id, today=TODAY,
            )

        assert len(rows) == 1
        assert Decimal(str(rows[0].rate_cents_per_kwh)) == Decimal("9.5")

    async def test_metered_service_rejects_a_flat_monthly(
        self, db: AsyncSession,
    ) -> None:
        """15.06¢/kWh against 6000 reads as 99.7% *below* market — a
        permanently wrong all-clear rather than a visible error."""
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(
                market_rate_benchmark_service.InvalidMarketRateBenchmarkError,
            ):
                await market_rate_benchmark_service.upsert_benchmark(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    service_type=SERVICE_TYPE_ELECTRICITY,
                    rate_cents_per_kwh=None,
                    monthly_cents=6000,
                    source=None,
                    observed_on=TODAY,
                    notes=None,
                )

    async def test_flat_service_rejects_a_metered_rate(
        self, db: AsyncSession,
    ) -> None:
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(
                market_rate_benchmark_service.InvalidMarketRateBenchmarkError,
            ):
                await market_rate_benchmark_service.upsert_benchmark(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    service_type=SERVICE_TYPE_INTERNET,
                    rate_cents_per_kwh=Decimal("11.1000"),
                    monthly_cents=None,
                    source=None,
                    observed_on=TODAY,
                    notes=None,
                )

    async def test_unknown_service_type_is_rejected_before_the_check_constraint(
        self, db: AsyncSession,
    ) -> None:
        """Otherwise the CHECK surfaces as a 500 instead of a readable 422."""
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(
                market_rate_benchmark_service.InvalidMarketRateBenchmarkError,
            ):
                await market_rate_benchmark_service.upsert_benchmark(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    service_type="sewage",
                    rate_cents_per_kwh=Decimal("1.0"),
                    monthly_cents=None,
                    source=None,
                    observed_on=TODAY,
                    notes=None,
                )

    async def test_delete_of_a_missing_benchmark_raises_not_found(
        self, db: AsyncSession,
    ) -> None:
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(
                market_rate_benchmark_service.MarketRateBenchmarkNotFoundError,
            ):
                await market_rate_benchmark_service.delete_benchmark(
                    organization_id=uuid.uuid4(),
                    service_type=SERVICE_TYPE_ELECTRICITY,
                )

    async def test_stale_flag_is_derived_on_read(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        observed = TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1)
        await _make_benchmark(db, org_id=org_id, user_id=user_id, observed_on=observed)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            rows = await market_rate_benchmark_service.list_benchmarks(
                organization_id=org_id, today=TODAY,
            )

        assert rows[0].is_stale is True
