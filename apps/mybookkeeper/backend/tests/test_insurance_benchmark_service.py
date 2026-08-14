"""Tests for the insurance benchmark service and the premium comparison.

The arithmetic itself is covered in ``test_insurance_benchmark_compare.py``.
What these pin is the orchestration around it: which policies get measured
(unexpired ones only), how unmeasurable policies are surfaced rather than
dropped, the ordering that puts the most expensive mistake first, and the
upsert semantics of a per-organization singleton.

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

from app.core.insurance_benchmark_constants import (
    BENCHMARK_STALE_AFTER_DAYS,
    BENCHMARK_STATUS_NOT_COMPARABLE,
    BENCHMARK_STATUS_NO_BENCHMARK,
)
from app.models.properties.property import Property
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.insurance import insurance_benchmark_repo, insurance_policy_repo
from app.services.insurance import insurance_benchmark_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 8, 13)

_UOW_TARGET = "app.services.insurance.insurance_benchmark_service.unit_of_work"

# $1,200/yr on $400,000 → 300 cents per $1,000 of coverage.
MARKET_PREMIUM_CENTS = 120_000
MARKET_COVERAGE_CENTS = 40_000_000


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name="6732 Peerless St",
    )
    db.add(prop)
    await db.flush()
    return prop


async def _make_policy(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    policy_name: str = "Dwelling HO-3",
    premium_cents: int | None = 200_000,
    premium_frequency: str | None = "annual",
    coverage_amount_cents: int | None = MARKET_COVERAGE_CENTS,
    expiration_date: _dt.date | None = _dt.date(2027, 3, 1),
):
    return await insurance_policy_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        property_id=property_id,
        policy_name=policy_name,
        premium_cents=premium_cents,
        premium_frequency=premium_frequency,
        coverage_amount_cents=coverage_amount_cents,
        expiration_date=expiration_date,
    )


async def _make_benchmark(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    annual_premium_cents: int = MARKET_PREMIUM_CENTS,
    coverage_amount_cents: int = MARKET_COVERAGE_CENTS,
    observed_on: _dt.date = TODAY,
):
    return await insurance_benchmark_repo.upsert(
        db,
        recorded_by_user_id=user_id,
        organization_id=org_id,
        annual_premium_cents=annual_premium_cents,
        coverage_amount_cents=coverage_amount_cents,
        region_label="Harris County, TX",
        source="TDI HelpInsure, HO-3, $2,500 deductible",
        observed_on=observed_on,
        notes=None,
    )


class TestBenchmarkCrud:
    async def test_get_returns_none_before_anything_is_recorded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The ordinary starting state of every organization, not an error."""
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            assert (
                await insurance_benchmark_service.get_benchmark(
                    organization_id=test_org.id,
                )
                is None
            )

    async def test_upsert_creates_then_replaces_the_single_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            first = await insurance_benchmark_service.upsert_benchmark(
                user_id=test_user.id,
                organization_id=test_org.id,
                annual_premium_cents=MARKET_PREMIUM_CENTS,
                coverage_amount_cents=MARKET_COVERAGE_CENTS,
                region_label="Harris County, TX",
                source="TDI HelpInsure",
                observed_on=TODAY,
                notes=None,
            )
            second = await insurance_benchmark_service.upsert_benchmark(
                user_id=test_user.id,
                organization_id=test_org.id,
                annual_premium_cents=150_000,
                coverage_amount_cents=MARKET_COVERAGE_CENTS,
                region_label="Harris County, TX",
                source="Renewal quote",
                observed_on=TODAY,
                notes=None,
            )

        # Same row updated, not a second one — the org has one benchmark.
        assert second.id == first.id
        assert second.annual_premium_cents == 150_000

    async def test_response_carries_the_normalised_rate(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """So the UI can show the same figure policies are measured against."""
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            saved = await insurance_benchmark_service.upsert_benchmark(
                user_id=test_user.id,
                organization_id=test_org.id,
                annual_premium_cents=MARKET_PREMIUM_CENTS,
                coverage_amount_cents=MARKET_COVERAGE_CENTS,
                region_label=None,
                source=None,
                observed_on=TODAY,
                notes=None,
            )
        assert saved.rate_cents_per_1000_coverage == Decimal("300.00")

    async def test_delete_removes_it_and_then_reports_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            await insurance_benchmark_service.delete_benchmark(
                organization_id=test_org.id,
            )
            with pytest.raises(
                insurance_benchmark_service.InsuranceBenchmarkNotFoundError,
            ):
                await insurance_benchmark_service.delete_benchmark(
                    organization_id=test_org.id,
                )

    async def test_one_org_cannot_read_anothers_benchmark(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            assert (
                await insurance_benchmark_service.get_benchmark(
                    organization_id=uuid.uuid4(),
                )
                is None
            )


class TestGetPremiumComparison:
    async def test_flags_a_policy_priced_above_the_market(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id)
        # $2,000/yr on $400,000 → 500¢ per $1,000 against a 300¢ market.
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.total_above_market == 1
        assert result.total_considered == 1
        row = result.above_market[0]
        assert row.policy.policy_name == "Dwelling HO-3"
        assert row.gap_pct == Decimal("66.7")
        assert result.has_stale_benchmark is False
        # Echoed so the card can name what it compared against.
        assert result.benchmark is not None
        assert result.benchmark.rate_cents_per_1000_coverage == Decimal("300.00")

    async def test_a_well_priced_policy_appears_in_neither_list(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """At-or-below is the quiet case — nothing for the operator to do."""
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            premium_cents=110_000,
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.above_market == []
        assert result.not_compared == []
        # But it was looked at — without this the card could not tell an
        # all-clear from an empty portfolio.
        assert result.total_considered == 1

    async def test_premium_is_annualised_before_it_is_compared(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """$167/mo is $2,004/yr — comparing the monthly figure raw would call
        the most expensive policy in the portfolio a bargain."""
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            premium_cents=16_700,
            premium_frequency="monthly",
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.total_above_market == 1

    async def test_expired_policies_are_not_measured(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """A lapsed policy's price is history; flagging it would be noise."""
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            policy_name="Lapsed and expensive",
            premium_cents=400_000,
            expiration_date=TODAY - _dt.timedelta(days=1),
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.above_market == []
        assert result.total_considered == 0

    async def test_a_policy_with_no_expiration_date_is_still_measured(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """An unknown end date is not evidence the policy lapsed."""
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            expiration_date=None,
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.total_above_market == 1

    async def test_policy_without_a_benchmark_is_surfaced_not_dropped(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Silence would read as an all-clear the app has not earned."""
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.above_market == []
        assert len(result.not_compared) == 1
        assert result.not_compared[0].status == BENCHMARK_STATUS_NO_BENCHMARK
        assert result.benchmark is None

    async def test_policy_without_coverage_is_surfaced_as_not_comparable(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            coverage_amount_cents=None,
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert len(result.not_compared) == 1
        assert result.not_compared[0].status == BENCHMARK_STATUS_NOT_COMPARABLE

    async def test_widest_gap_reads_first(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            policy_name="Merely dear",
            premium_cents=180_000,
        )
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            policy_name="Worst offender",
            premium_cents=300_000,
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert [r.policy.policy_name for r in result.above_market] == [
            "Worst offender",
            "Merely dear",
        ]

    async def test_stale_benchmark_is_flagged_on_the_payload(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        await _make_benchmark(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            observed_on=TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=test_user.id, organization_id=test_org.id, today=TODAY,
            )

        assert result.has_stale_benchmark is True
        assert result.above_market[0].benchmark_is_stale is True

    async def test_another_orgs_policies_are_not_measured(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id)
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        await _make_benchmark(db, org_id=test_org.id, user_id=test_user.id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await insurance_benchmark_service.get_premium_comparison(
                user_id=uuid.uuid4(), organization_id=uuid.uuid4(), today=TODAY,
            )

        assert result.total_considered == 0
        assert result.above_market == []
