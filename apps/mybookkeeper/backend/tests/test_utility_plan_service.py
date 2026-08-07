"""Tests for the utility-plan renewal logic.

The behaviour worth pinning is the derivation, not the CRUD: a plan's renewal
status is computed from ``rate_type`` + ``term_end_date`` + today on every
read, so it can never go stale the way a stored status would. These tests pass
an explicit ``today`` so the boundaries are exact and the suite does not change
meaning as the calendar moves.

Also covers the two suppression rules that keep the alert badge credible — a
superseded plan and a regulated (no-competitor) plan never raise an alert.

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

from app.core.utility_plan_constants import (
    EXPIRING_SOON_DAYS,
    RATE_TYPE_FIXED,
    RATE_TYPE_INDEXED,
    RATE_TYPE_REGULATED,
    RATE_TYPE_VARIABLE,
    RENEWAL_STATUS_ACTIVE,
    RENEWAL_STATUS_EXPIRED,
    RENEWAL_STATUS_EXPIRING_SOON,
    RENEWAL_STATUS_NOT_APPLICABLE,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_NATURAL_GAS,
)
from app.models.properties.property import Property
from app.repositories.properties import utility_plan_repo
from app.services.properties import utility_plan_service

TODAY = _dt.date(2026, 8, 7)

_UOW_TARGET = "app.services.properties.utility_plan_service.unit_of_work"


def _make_fake_uow(session: AsyncSession):
    """Return a ``unit_of_work`` replacement that yields the test session."""
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


async def _make_property(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
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


class TestRenewalStatus:
    """Boundary behaviour of the derived status."""

    def test_far_future_term_is_active(self) -> None:
        assert (
            utility_plan_service.renewal_status(
                RATE_TYPE_FIXED, _dt.date(2027, 1, 1), today=TODAY,
            )
            == RENEWAL_STATUS_ACTIVE
        )

    def test_exactly_at_window_edge_is_expiring_soon(self) -> None:
        edge = TODAY + _dt.timedelta(days=EXPIRING_SOON_DAYS)
        assert (
            utility_plan_service.renewal_status(RATE_TYPE_FIXED, edge, today=TODAY)
            == RENEWAL_STATUS_EXPIRING_SOON
        )

    def test_one_day_past_window_is_still_active(self) -> None:
        outside = TODAY + _dt.timedelta(days=EXPIRING_SOON_DAYS + 1)
        assert (
            utility_plan_service.renewal_status(RATE_TYPE_FIXED, outside, today=TODAY)
            == RENEWAL_STATUS_ACTIVE
        )

    def test_term_ending_today_is_expiring_soon_not_expired(self) -> None:
        # Service runs through the final day; it has not lapsed yet.
        assert (
            utility_plan_service.renewal_status(RATE_TYPE_FIXED, TODAY, today=TODAY)
            == RENEWAL_STATUS_EXPIRING_SOON
        )

    def test_yesterday_is_expired(self) -> None:
        assert (
            utility_plan_service.renewal_status(
                RATE_TYPE_FIXED, TODAY - _dt.timedelta(days=1), today=TODAY,
            )
            == RENEWAL_STATUS_EXPIRED
        )

    def test_regulated_service_never_has_a_renewal_deadline(self) -> None:
        # Houston natural gas: no competing supplier exists, so an "expired"
        # badge would be advice the operator cannot act on.
        assert (
            utility_plan_service.renewal_status(
                RATE_TYPE_REGULATED, _dt.date(2020, 1, 1), today=TODAY,
            )
            == RENEWAL_STATUS_NOT_APPLICABLE
        )

    def test_missing_end_date_is_not_applicable(self) -> None:
        assert (
            utility_plan_service.renewal_status(RATE_TYPE_FIXED, None, today=TODAY)
            == RENEWAL_STATUS_NOT_APPLICABLE
        )

    def test_indexed_plans_are_classified_like_fixed(self) -> None:
        assert (
            utility_plan_service.renewal_status(
                RATE_TYPE_INDEXED, TODAY - _dt.timedelta(days=5), today=TODAY,
            )
            == RENEWAL_STATUS_EXPIRED
        )

    def test_window_is_overridable(self) -> None:
        end = TODAY + _dt.timedelta(days=60)
        assert (
            utility_plan_service.renewal_status(
                RATE_TYPE_FIXED, end, today=TODAY, window_days=90,
            )
            == RENEWAL_STATUS_EXPIRING_SOON
        )


class TestDaysUntilTermEnd:
    def test_future_is_positive(self) -> None:
        assert (
            utility_plan_service.days_until_term_end(
                TODAY + _dt.timedelta(days=10), today=TODAY,
            )
            == 10
        )

    def test_past_is_negative(self) -> None:
        assert (
            utility_plan_service.days_until_term_end(
                TODAY - _dt.timedelta(days=193), today=TODAY,
            )
            == -193
        )

    def test_none_when_open_ended(self) -> None:
        assert utility_plan_service.days_until_term_end(None, today=TODAY) is None


@pytest.mark.asyncio
class TestCurrentPlanResolution:
    async def test_latest_start_date_wins_per_property_and_service(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6734 Peerless St")

        old = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Old REP",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2024, 1, 1),
        )
        new = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="New REP",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 23),
        )

        assert utility_plan_service.current_plan_ids([old, new]) == {new.id}

    async def test_different_service_types_are_independent(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")

        power = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 23),
        )
        gas = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
            provider_name="CenterPoint",
            rate_type=RATE_TYPE_REGULATED,
            service_start_date=_dt.date(2024, 6, 1),
        )

        # Electricity and gas each keep their own current row.
        assert utility_plan_service.current_plan_ids([power, gas]) == {
            power.id, gas.id,
        }

    async def test_dated_row_outranks_undated_stub(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6738 Peerless St")

        stub = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Unknown",
            rate_type=RATE_TYPE_VARIABLE,
            service_start_date=None,
        )
        dated = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 27),
        )

        assert utility_plan_service.current_plan_ids([stub, dated]) == {dated.id}


@pytest.mark.asyncio
class TestRenewalAlerts:
    async def test_expired_current_plan_is_reported(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6738 Peerless St")
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            plan_name="FIXED + Air Conditioner Protection",
            rate_type=RATE_TYPE_FIXED,
            energy_charge_cents_per_kwh=Decimal("11.6000"),
            avg_price_cents_per_kwh_at_1000=Decimal("13.9000"),
            term_months=12,
            service_start_date=_dt.date(2025, 1, 27),
            term_end_date=_dt.date(2026, 1, 27),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.total_needing_attention == 1
        assert result.window_days == EXPIRING_SOON_DAYS
        assert len(result.expired) == 1
        assert result.expired[0].property_name == "6738 Peerless St"
        assert result.expired[0].days_until_term_end == -192
        assert result.expired[0].is_current is True
        assert result.expiring_soon == []

    async def test_regulated_gas_plan_raises_no_alert(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
            provider_name="CenterPoint",
            rate_type=RATE_TYPE_REGULATED,
            # Even with a long-past end date, there is nothing to switch to.
            term_end_date=_dt.date(2020, 1, 1),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.total_needing_attention == 0

    async def test_superseded_expired_plan_is_not_alerted(
        self, db: AsyncSession,
    ) -> None:
        """History should not nag. Only the plan in force can need renewing."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6734 Peerless St")
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Old REP",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2024, 1, 1),
            term_end_date=_dt.date(2025, 1, 1),
        )
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 23),
            term_end_date=_dt.date(2027, 1, 23),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.total_needing_attention == 0

    async def test_soft_deleted_plan_is_excluded(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6738 Peerless St")
        plan = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 27),
            term_end_date=_dt.date(2026, 1, 27),
        )
        await utility_plan_repo.soft_delete(
            db, plan_id=plan.id, user_id=user_id, organization_id=org_id,
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert result.total_needing_attention == 0

    async def test_expiring_soon_sorted_soonest_first(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        far = await _make_property(db, org_id, user_id, "Far St")
        near = await _make_property(db, org_id, user_id, "Near St")
        for prop, end in (
            (far, TODAY + _dt.timedelta(days=40)),
            (near, TODAY + _dt.timedelta(days=5)),
        ):
            await utility_plan_repo.create(
                db,
                user_id=user_id,
                organization_id=org_id,
                property_id=prop.id,
                service_type=SERVICE_TYPE_ELECTRICITY,
                provider_name="Some REP",
                rate_type=RATE_TYPE_FIXED,
                service_start_date=_dt.date(2025, 1, 1),
                term_end_date=end,
            )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert [s.property_name for s in result.expiring_soon] == ["Near St", "Far St"]

    async def test_expired_sorted_longest_lapsed_first(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        recent = await _make_property(db, org_id, user_id, "Recent St")
        stale = await _make_property(db, org_id, user_id, "Stale St")
        for prop, end in (
            (recent, TODAY - _dt.timedelta(days=10)),
            (stale, TODAY - _dt.timedelta(days=400)),
        ):
            await utility_plan_repo.create(
                db,
                user_id=user_id,
                organization_id=org_id,
                property_id=prop.id,
                service_type=SERVICE_TYPE_ELECTRICITY,
                provider_name="Some REP",
                rate_type=RATE_TYPE_FIXED,
                service_start_date=_dt.date(2023, 1, 1),
                term_end_date=end,
            )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=user_id, organization_id=org_id, today=TODAY,
            )

        assert [s.property_name for s in result.expired] == ["Stale St", "Recent St"]

    async def test_another_orgs_plans_are_invisible(self, db: AsyncSession) -> None:
        mine_org, mine_user = uuid.uuid4(), uuid.uuid4()
        other_org, other_user = uuid.uuid4(), uuid.uuid4()
        other_prop = await _make_property(db, other_org, other_user, "Not Mine St")
        await utility_plan_repo.create(
            db,
            user_id=other_user,
            organization_id=other_org,
            property_id=other_prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 27),
            term_end_date=_dt.date(2026, 1, 27),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            result = await utility_plan_service.get_renewal_alerts(
                user_id=mine_user, organization_id=mine_org, today=TODAY,
            )

        assert result.total_needing_attention == 0


@pytest.mark.asyncio
class TestSweepPlansNeedingRenewal:
    """The scheduler's cross-tenant sweep."""

    async def test_covers_every_tenant(self, db: AsyncSession) -> None:
        org_a, user_a = uuid.uuid4(), uuid.uuid4()
        org_b, user_b = uuid.uuid4(), uuid.uuid4()
        prop_a = await _make_property(db, org_a, user_a, "Tenant A St")
        prop_b = await _make_property(db, org_b, user_b, "Tenant B St")
        for org_id, user_id, prop in (
            (org_a, user_a, prop_a),
            (org_b, user_b, prop_b),
        ):
            await utility_plan_repo.create(
                db,
                user_id=user_id,
                organization_id=org_id,
                property_id=prop.id,
                service_type=SERVICE_TYPE_ELECTRICITY,
                provider_name="Constellation",
                rate_type=RATE_TYPE_FIXED,
                service_start_date=_dt.date(2025, 1, 27),
                term_end_date=_dt.date(2026, 1, 27),
            )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            flagged = await utility_plan_service.sweep_plans_needing_renewal(
                today=TODAY,
            )

        assert {s.property_name for s in flagged} == {"Tenant A St", "Tenant B St"}

    async def test_applies_the_same_suppression_rules_as_the_dashboard(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6734 Peerless St")
        # Superseded: expired, but no longer the plan in force.
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Old REP",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2024, 1, 1),
            term_end_date=_dt.date(2025, 1, 1),
        )
        # Current and expired — the one real flag.
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 27),
            term_end_date=_dt.date(2026, 1, 27),
        )
        # Regulated: expired on paper, nothing to switch to.
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
            provider_name="CenterPoint",
            rate_type=RATE_TYPE_REGULATED,
            term_end_date=_dt.date(2020, 1, 1),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            flagged = await utility_plan_service.sweep_plans_needing_renewal(
                today=TODAY,
            )

        assert [s.provider_name for s in flagged] == ["Constellation"]

    async def test_plans_outside_the_window_are_not_flagged(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "Safe St")
        await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2026, 1, 1),
            term_end_date=TODAY + _dt.timedelta(days=EXPIRING_SOON_DAYS + 1),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            flagged = await utility_plan_service.sweep_plans_needing_renewal(
                today=TODAY,
            )

        assert flagged == []


@pytest.mark.asyncio
class TestUpdatePlan:
    async def test_patch_rejects_term_end_before_stored_start(
        self, db: AsyncSession,
    ) -> None:
        """A partial update can break a rule using a field it did not send."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St")
        plan = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
            service_start_date=_dt.date(2025, 1, 27),
            term_end_date=_dt.date(2026, 1, 27),
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(utility_plan_service.InvalidUtilityPlanError):
                await utility_plan_service.update_plan(
                    user_id=user_id,
                    organization_id=org_id,
                    plan_id=plan.id,
                    fields={"term_end_date": _dt.date(2024, 6, 1)},
                )

    async def test_account_number_is_normalized_on_update(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6734 Peerless St")
        plan = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
            provider_name="CenterPoint",
            rate_type=RATE_TYPE_REGULATED,
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await utility_plan_service.update_plan(
                user_id=user_id,
                organization_id=org_id,
                plan_id=plan.id,
                fields={"account_number": "6403771807-5"},
            )

        # Same normalization as utility_account_link, so the plan and the
        # learned bill -> property link describe one account key.
        assert detail.account_number == "64037718075"

    async def test_unknown_plan_raises_not_found(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(utility_plan_service.UtilityPlanNotFoundError):
                await utility_plan_service.update_plan(
                    user_id=user_id,
                    organization_id=org_id,
                    plan_id=uuid.uuid4(),
                    fields={"provider_name": "Anything"},
                )
