"""Repository tests for ``utility_plans``.

Focus is on the two invariants every query in this module must hold — tenant
scoping and soft-delete filtering — plus the filters and ordering the list
endpoint depends on. ``list_all_active_for_org`` is unpaginated on purpose
(current-plan resolution is only correct over the complete set), so it gets its
own coverage rather than being assumed to behave like ``list_for_org``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    RATE_TYPE_REGULATED,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_NATURAL_GAS,
)
from app.models.properties.property import Property
from app.repositories.properties import utility_plan_repo

pytestmark = pytest.mark.asyncio


async def _make_property(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str = "6732 Peerless St",
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
    provider_name: str = "Constellation",
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


class TestCreateAndGet:
    async def test_round_trips_all_rate_precision(self, db: AsyncSession) -> None:
        """A TDU charge of 5.3509 ¢/kWh must survive the round trip intact."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            energy_charge_cents_per_kwh=Decimal("11.6000"),
            tdu_charge_cents_per_kwh=Decimal("5.3509"),
        )
        # Refresh forces a read back out of the database rather than reading
        # the value still sitting in the identity map.
        await db.refresh(plan)

        assert Decimal(str(plan.tdu_charge_cents_per_kwh)) == Decimal("5.3509")
        assert Decimal(str(plan.energy_charge_cents_per_kwh)) == Decimal("11.6")

    async def test_get_is_scoped_to_the_owning_org(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )

        assert (
            await utility_plan_repo.get(
                db,
                plan_id=plan.id,
                user_id=user_id,
                organization_id=uuid.uuid4(),
            )
            is None
        )

    async def test_get_is_scoped_to_the_owning_user(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )

        assert (
            await utility_plan_repo.get(
                db,
                plan_id=plan.id,
                user_id=uuid.uuid4(),
                organization_id=org_id,
            )
            is None
        )


class TestListAndCount:
    async def test_filters_by_property(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        a = await _make_property(db, org_id, user_id, "6732 Peerless St")
        b = await _make_property(db, org_id, user_id, "6734 Peerless St")
        await _make_plan(db, org_id=org_id, user_id=user_id, property_id=a.id)
        await _make_plan(db, org_id=org_id, user_id=user_id, property_id=b.id)

        rows = await utility_plan_repo.list_for_org(
            db, user_id=user_id, organization_id=org_id, property_id=a.id,
        )
        assert [r.property_id for r in rows] == [a.id]
        assert (
            await utility_plan_repo.count_for_org(
                db, user_id=user_id, organization_id=org_id, property_id=a.id,
            )
            == 1
        )

    async def test_filters_by_service_type(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        await _make_plan(db, org_id=org_id, user_id=user_id, property_id=prop.id)
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
            provider_name="CenterPoint",
            rate_type=RATE_TYPE_REGULATED,
        )

        rows = await utility_plan_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=org_id,
            service_type=SERVICE_TYPE_NATURAL_GAS,
        )
        assert [r.provider_name for r in rows] == ["CenterPoint"]

    async def test_expiring_before_excludes_open_ended_plans(
        self, db: AsyncSession,
    ) -> None:
        """A null term_end_date is "no deadline", not "deadline in the past"."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            provider_name="Open Ended",
            term_end_date=None,
        )
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            provider_name="Lapsing",
            term_end_date=_dt.date(2026, 1, 27),
        )

        rows = await utility_plan_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=org_id,
            expiring_before=_dt.date(2026, 9, 1),
        )
        assert [r.provider_name for r in rows] == ["Lapsing"]

    async def test_orders_newest_service_start_first(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            provider_name="Older",
            service_start_date=_dt.date(2024, 1, 1),
        )
        await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            provider_name="Newer",
            service_start_date=_dt.date(2025, 1, 23),
        )

        rows = await utility_plan_repo.list_for_org(
            db, user_id=user_id, organization_id=org_id,
        )
        assert [r.provider_name for r in rows] == ["Newer", "Older"]

    async def test_pagination_slices_without_changing_the_total(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        for day in range(1, 4):
            await _make_plan(
                db,
                org_id=org_id,
                user_id=user_id,
                property_id=prop.id,
                service_start_date=_dt.date(2025, 1, day),
            )

        page = await utility_plan_repo.list_for_org(
            db, user_id=user_id, organization_id=org_id, limit=2, offset=1,
        )
        assert len(page) == 2
        assert (
            await utility_plan_repo.count_for_org(
                db, user_id=user_id, organization_id=org_id,
            )
            == 3
        )

    async def test_another_orgs_rows_are_never_listed(
        self, db: AsyncSession,
    ) -> None:
        mine_org, mine_user = uuid.uuid4(), uuid.uuid4()
        other_org, other_user = uuid.uuid4(), uuid.uuid4()
        other_prop = await _make_property(db, other_org, other_user, "Not Mine St")
        await _make_plan(
            db,
            org_id=other_org,
            user_id=other_user,
            property_id=other_prop.id,
        )

        assert (
            await utility_plan_repo.list_for_org(
                db, user_id=mine_user, organization_id=mine_org,
            )
            == []
        )
        assert (
            await utility_plan_repo.count_for_org(
                db, user_id=mine_user, organization_id=mine_org,
            )
            == 0
        )


class TestListAllActive:
    async def test_returns_every_row_regardless_of_page_size(
        self, db: AsyncSession,
    ) -> None:
        """Unpaginated by contract — current-plan resolution needs the full set."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        for day in range(1, 8):
            await _make_plan(
                db,
                org_id=org_id,
                user_id=user_id,
                property_id=prop.id,
                service_start_date=_dt.date(2025, 1, day),
            )

        rows = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=org_id,
        )
        assert len(rows) == 7

    async def test_excludes_soft_deleted_rows(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        kept = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
            provider_name="Kept",
        )
        gone = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
            provider_name="Gone",
        )
        await utility_plan_repo.soft_delete(
            db, plan_id=gone.id, user_id=user_id, organization_id=org_id,
        )

        rows = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=org_id,
        )
        assert [r.id for r in rows] == [kept.id]


class TestUpdate:
    async def test_applies_only_the_supplied_fields(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db,
            org_id=org_id,
            user_id=user_id,
            property_id=prop.id,
            plan_name="Original",
            term_months=12,
        )

        updated = await utility_plan_repo.update_plan(
            db,
            plan_id=plan.id,
            user_id=user_id,
            organization_id=org_id,
            fields={"plan_name": "Renewed"},
        )
        assert updated is not None
        assert updated.plan_name == "Renewed"
        assert updated.term_months == 12

    async def test_returns_none_for_another_orgs_row(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )

        assert (
            await utility_plan_repo.update_plan(
                db,
                plan_id=plan.id,
                user_id=user_id,
                organization_id=uuid.uuid4(),
                fields={"plan_name": "Hijacked"},
            )
            is None
        )


class TestSoftDelete:
    async def test_hides_the_row_from_subsequent_reads(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )

        assert (
            await utility_plan_repo.soft_delete(
                db, plan_id=plan.id, user_id=user_id, organization_id=org_id,
            )
            is True
        )
        assert (
            await utility_plan_repo.get(
                db, plan_id=plan.id, user_id=user_id, organization_id=org_id,
            )
            is None
        )

    async def test_row_is_retained_and_readable_with_include_deleted(
        self, db: AsyncSession,
    ) -> None:
        """Soft delete, not a hard one — the rate history survives."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )
        await utility_plan_repo.soft_delete(
            db, plan_id=plan.id, user_id=user_id, organization_id=org_id,
        )

        found = await utility_plan_repo.get(
            db,
            plan_id=plan.id,
            user_id=user_id,
            organization_id=org_id,
            include_deleted=True,
        )
        assert found is not None
        assert found.deleted_at is not None

    async def test_second_delete_is_a_no_op(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )
        await utility_plan_repo.soft_delete(
            db, plan_id=plan.id, user_id=user_id, organization_id=org_id,
        )

        assert (
            await utility_plan_repo.soft_delete(
                db, plan_id=plan.id, user_id=user_id, organization_id=org_id,
            )
            is False
        )

    async def test_cannot_delete_another_orgs_row(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        plan = await _make_plan(
            db, org_id=org_id, user_id=user_id, property_id=prop.id,
        )

        assert (
            await utility_plan_repo.soft_delete(
                db,
                plan_id=plan.id,
                user_id=user_id,
                organization_id=uuid.uuid4(),
            )
            is False
        )
