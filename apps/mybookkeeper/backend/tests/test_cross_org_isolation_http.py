"""HTTP-level cross-org isolation for the rent ledger, tax-return overrides,
booking statements, classification rules and activities.

Two orgs, two users. Org A owns one row of each kind; every request is then made
as Org B (an owner of its own org) and must neither see nor change Org A's rows.
The app's convention for a foreign id is 404, never 403, so a caller cannot tell
a row in another org from one that does not exist.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import AsyncIterator, NamedTuple
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.classification.classification_rule import ClassificationRule
from app.models.organization.activity import Activity
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_schedule import RentSchedule
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.booking_statement import BookingStatement
from app.models.user.user import User
from app.repositories import organization_repo
from tests.utc_today import utc_today

_SESSION_PATCH_TARGETS = (
    "app.services.rent.rent_ledger_service.unit_of_work",
    "app.services.rent.rent_schedule_service.unit_of_work",
    "app.services.transactions.booking_statement_query_service.AsyncSessionLocal",
    "app.services.tax.tax_return_service.AsyncSessionLocal",
    "app.services.tax.tax_return_service.unit_of_work",
    "app.services.tax.tax_recompute_service.unit_of_work",
    "app.services.classification.rule_service.AsyncSessionLocal",
    "app.services.classification.rule_service.unit_of_work",
    "app.services.organization.activity_service.AsyncSessionLocal",
    "app.services.organization.activity_service.unit_of_work",
)


class OrgSide(NamedTuple):
    user: User
    org: Organization


class OrgAData(NamedTuple):
    applicant_id: uuid.UUID
    schedule_id: uuid.UUID
    charge_id: uuid.UUID
    tax_return_id: uuid.UUID
    instance_id: uuid.UUID
    field_id: uuid.UUID
    booking_statement_id: uuid.UUID
    property_id: uuid.UUID
    rule_id: uuid.UUID
    activity_id: uuid.UUID


async def _make_side(db: AsyncSession, label: str) -> OrgSide:
    user = User(
        id=uuid.uuid4(),
        email=f"{label}-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    org = await organization_repo.create(db, f"Org {label}", user.id)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return OrgSide(user, org)


@pytest_asyncio.fixture()
async def side_a(db: AsyncSession) -> OrgSide:
    return await _make_side(db, "a")


@pytest_asyncio.fixture()
async def side_b(db: AsyncSession) -> OrgSide:
    return await _make_side(db, "b")


@pytest.fixture(autouse=True)
def _share_test_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    patches = [patch(target, _fake_session) for target in _SESSION_PATCH_TARGETS]
    for p in patches:
        p.start()
    yield
    for p in patches:
        p.stop()


@pytest_asyncio.fixture()
async def org_a_data(db: AsyncSession, side_a: OrgSide) -> OrgAData:
    org_id, user_id = side_a.org.id, side_a.user.id

    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        name="A House", type=PropertyType.SHORT_TERM,
    )
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, stage="lease_signed",
    )
    db.add_all([prop, applicant])
    await db.flush()

    schedule = RentSchedule(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        applicant_id=applicant.id, amount=Decimal("1000.00"),
        cadence="monthly", start_date=_dt.date(2026, 1, 1),
    )
    charge = RentCharge(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        applicant_id=applicant.id, charge_type="rent",
        period_start=_dt.date(2026, 1, 1), period_end=_dt.date(2026, 1, 31),
        due_date=_dt.date(2026, 1, 1), amount=Decimal("1000.00"),
    )
    tax_return = TaxReturn(id=uuid.uuid4(), organization_id=org_id, tax_year=2025)
    db.add_all([schedule, charge, tax_return])
    await db.flush()

    instance = TaxFormInstance(
        id=uuid.uuid4(), tax_return_id=tax_return.id,
        form_name="schedule_e", source_type="computed",
    )
    db.add(instance)
    await db.flush()
    field = TaxFormField(
        id=uuid.uuid4(), form_instance_id=instance.id, field_id="line_3",
        field_label="Rents received", value_numeric=Decimal("42500.00"),
        is_calculated=True,
    )
    statement = BookingStatement(
        id=uuid.uuid4(), organization_id=org_id, property_id=prop.id,
        res_code="RESA", check_in=_dt.date(2025, 6, 1), check_out=_dt.date(2025, 6, 5),
        gross_booking=Decimal("500.00"), platform="airbnb",
    )
    rule = ClassificationRule(
        id=uuid.uuid4(), organization_id=org_id, created_by=user_id,
        match_type="vendor", match_pattern="acme", category="maintenance",
    )
    activity = Activity(
        id=uuid.uuid4(), organization_id=org_id, activity_type="self_employment",
        label="A Activity", tax_form="schedule_c",
    )
    db.add_all([field, statement, rule, activity])
    await db.commit()

    return OrgAData(
        applicant_id=applicant.id, schedule_id=schedule.id, charge_id=charge.id,
        tax_return_id=tax_return.id, instance_id=instance.id, field_id=field.id,
        booking_statement_id=statement.id, property_id=prop.id,
        rule_id=rule.id, activity_id=activity.id,
    )


@pytest_asyncio.fixture()
async def client_b(side_b: OrgSide) -> AsyncIterator[AsyncClient]:
    async def _ctx() -> RequestContext:
        return RequestContext(
            organization_id=side_b.org.id, user_id=side_b.user.id, org_role="owner",
        )

    app.dependency_overrides[current_active_user] = lambda: None
    app.dependency_overrides[current_org_member] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


class TestRentLedgerIsolation:
    @pytest.mark.asyncio
    async def test_cannot_read_other_orgs_ledger(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(
            f"/rent-ledger/tenants/{org_a_data.applicant_id}", params={"as_of": utc_today().isoformat()},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_create_schedule_for_other_orgs_tenant(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            "/rent-ledger/schedules",
            json={
                "applicant_id": str(org_a_data.applicant_id), "amount": "900.00",
                "cadence": "monthly", "start_date": "2027-01-01", "today": utc_today().isoformat(),
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_add_charge_for_other_orgs_tenant(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            "/rent-ledger/charges",
            json={
                "applicant_id": str(org_a_data.applicant_id), "amount": "50.00",
                "due_date": "2026-02-01", "charge_type": "other",
                "period_start": "2026-02-01", "period_end": "2026-02-01",
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_update_other_orgs_schedule(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.patch(
            f"/rent-ledger/schedules/{org_a_data.schedule_id}",
            json={"notes": "hijacked", "today": utc_today().isoformat()},
        )
        assert resp.status_code == 404
        schedule = await db.get(RentSchedule, org_a_data.schedule_id)
        await db.refresh(schedule)
        assert schedule.notes != "hijacked"

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_schedule(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/rent-ledger/schedules/{org_a_data.schedule_id}")
        assert resp.status_code == 404
        schedule = await db.get(RentSchedule, org_a_data.schedule_id)
        await db.refresh(schedule)
        assert schedule.deleted_at is None

    @pytest.mark.asyncio
    async def test_cannot_waive_other_orgs_charge(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            f"/rent-ledger/charges/{org_a_data.charge_id}/waive",
            json={"reason": "not yours"},
        )
        assert resp.status_code == 404
        charge = await db.get(RentCharge, org_a_data.charge_id)
        await db.refresh(charge)
        assert charge.waived_at is None

    @pytest.mark.asyncio
    async def test_cannot_unwaive_other_orgs_charge(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/rent-ledger/charges/{org_a_data.charge_id}/waive")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_charge(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/rent-ledger/charges/{org_a_data.charge_id}")
        assert resp.status_code == 404
        charge = await db.get(RentCharge, org_a_data.charge_id)
        await db.refresh(charge)
        assert charge.deleted_at is None


class TestTaxReturnIsolation:
    @pytest.mark.asyncio
    async def test_list_excludes_other_orgs_returns(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get("/tax-returns")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_cannot_get_other_orgs_return(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(f"/tax-returns/{org_a_data.tax_return_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_override_field_on_other_orgs_return(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.patch(
            f"/tax-returns/{org_a_data.tax_return_id}/fields/{org_a_data.field_id}",
            json={"value_numeric": 1.0, "override_reason": "hijack"},
        )
        assert resp.status_code == 404
        field = await db.get(TaxFormField, org_a_data.field_id)
        await db.refresh(field)
        assert field.value_numeric == Decimal("42500.00")
        assert not field.is_overridden

    @pytest.mark.asyncio
    async def test_cannot_override_other_orgs_field_through_own_return(
        self, client_b: AsyncClient, db: AsyncSession, side_b: OrgSide,
        org_a_data: OrgAData,
    ) -> None:
        own_return = TaxReturn(id=uuid.uuid4(), organization_id=side_b.org.id, tax_year=2025)
        db.add(own_return)
        await db.commit()

        resp = await client_b.patch(
            f"/tax-returns/{own_return.id}/fields/{org_a_data.field_id}",
            json={"value_numeric": 1.0, "override_reason": "hijack"},
        )
        assert resp.status_code == 404
        field = await db.get(TaxFormField, org_a_data.field_id)
        await db.refresh(field)
        assert field.value_numeric == Decimal("42500.00")

    @pytest.mark.asyncio
    async def test_cannot_delete_instance_of_other_orgs_return(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(
            f"/tax-returns/{org_a_data.tax_return_id}/instances/{org_a_data.instance_id}",
        )
        assert resp.status_code == 404
        assert await db.get(TaxFormInstance, org_a_data.instance_id) is not None

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_instance_through_own_return(
        self, client_b: AsyncClient, db: AsyncSession, side_b: OrgSide,
        org_a_data: OrgAData,
    ) -> None:
        own_return = TaxReturn(id=uuid.uuid4(), organization_id=side_b.org.id, tax_year=2025)
        db.add(own_return)
        await db.commit()

        resp = await client_b.delete(
            f"/tax-returns/{own_return.id}/instances/{org_a_data.instance_id}",
        )
        assert resp.status_code == 404
        assert await db.get(TaxFormInstance, org_a_data.instance_id) is not None

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_return(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/tax-returns/{org_a_data.tax_return_id}")
        assert resp.status_code == 404
        assert await db.get(TaxReturn, org_a_data.tax_return_id) is not None


class TestBookingStatementIsolation:
    @pytest.mark.asyncio
    async def test_list_excludes_other_orgs_statements(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get("/booking-statements")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_filtered_by_other_orgs_property_is_empty(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(
            "/booking-statements", params={"property_id": str(org_a_data.property_id)},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_occupancy_excludes_other_orgs_bookings(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(
            "/booking-statements/occupancy",
            params={
                "property_id": str(org_a_data.property_id),
                "start_date": "2025-06-01", "end_date": "2025-07-01",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["total_nights"] == 0


class TestClassificationRuleIsolation:
    @pytest.mark.asyncio
    async def test_list_excludes_other_orgs_rules(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get("/classification-rules")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_rule(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/classification-rules/{org_a_data.rule_id}")
        assert resp.status_code == 404
        assert await db.get(ClassificationRule, org_a_data.rule_id) is not None

    @pytest.mark.asyncio
    async def test_cannot_create_rule_pointing_at_other_orgs_property(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            "/classification-rules",
            json={
                "match_type": "vendor", "match_pattern": "x", "category": "maintenance",
                "property_id": str(org_a_data.property_id),
            },
        )
        assert resp.status_code == 422
        rows = (await db.execute(
            select(ClassificationRule).where(ClassificationRule.match_pattern == "x"),
        )).scalars().all()
        assert rows == []


class TestActivityIsolation:
    @pytest.mark.asyncio
    async def test_list_excludes_other_orgs_activities(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get("/activities")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_cannot_update_other_orgs_activity(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.patch(
            f"/activities/{org_a_data.activity_id}", json={"label": "hijacked"},
        )
        assert resp.status_code == 404
        activity = await db.get(Activity, org_a_data.activity_id)
        await db.refresh(activity)
        assert activity.label == "A Activity"

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_activity(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/activities/{org_a_data.activity_id}")
        assert resp.status_code == 404
        assert await db.get(Activity, org_a_data.activity_id) is not None

    @pytest.mark.asyncio
    async def test_cannot_create_activity_for_other_orgs_property(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            "/activities",
            json={
                "label": "x", "activity_type": "rental_property",
                "tax_form": "schedule_e", "property_id": str(org_a_data.property_id),
            },
        )
        assert resp.status_code == 422
