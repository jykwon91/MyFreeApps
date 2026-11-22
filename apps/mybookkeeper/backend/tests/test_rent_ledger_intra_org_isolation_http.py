"""HTTP-level isolation for the rent ledger between two members of ONE org.

Applicants are scoped per user inside an organization, so a rent schedule or
charge is reachable only through a tenant the caller owns. Member A owns a
tenant with a schedule and a charge; member B (an admin of the same org, so
write access is not what stops them) must get the app's not-found answer on
every read and write of those rows, while A keeps full access.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import NamedTuple
from unittest.mock import patch

import pytest
import pytest_asyncio
from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_schedule import RentSchedule
from app.models.user.user import User
from app.repositories import organization_repo
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.utc_today import utc_today

_SESSION_PATCH_TARGETS = (
    "app.services.rent.rent_ledger_service.unit_of_work",
    "app.services.rent.rent_schedule_service.unit_of_work",
)


class SharedOrg(NamedTuple):
    org: Organization
    member_a: User
    member_b: User


class TenantRows(NamedTuple):
    applicant_id: uuid.UUID
    schedule_id: uuid.UUID
    charge_id: uuid.UUID


def _user(label: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{label}-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )


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
async def shared_org(db: AsyncSession) -> SharedOrg:
    member_a, member_b = _user("a"), _user("b")
    db.add_all([member_a, member_b])
    await db.commit()
    org = await organization_repo.create(db, "Shared Org", member_a.id)
    db.add(OrganizationMember(organization_id=org.id, user_id=member_b.id, org_role="admin"))
    await db.commit()
    await db.refresh(org)
    return SharedOrg(org, member_a, member_b)


@pytest_asyncio.fixture()
async def a_rows(db: AsyncSession, shared_org: SharedOrg) -> TenantRows:
    org_id, user_id = shared_org.org.id, shared_org.member_a.id
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, stage="lease_signed",
    )
    db.add(applicant)
    await db.flush()
    schedule = RentSchedule(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        applicant_id=applicant.id, amount=Decimal("1000.00"),
        cadence="monthly", start_date=_dt.date(2026, 1, 1),
    )
    charge = RentCharge(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        applicant_id=applicant.id, charge_type="other",
        period_start=_dt.date(2026, 2, 1), period_end=_dt.date(2026, 2, 1),
        due_date=_dt.date(2026, 2, 1), amount=Decimal("50.00"),
    )
    db.add_all([schedule, charge])
    await db.commit()
    return TenantRows(applicant.id, schedule.id, charge.id)


@pytest_asyncio.fixture()
async def client_as(
    shared_org: SharedOrg,
) -> AsyncIterator[Callable[[User, str], AsyncClient]]:
    """Return a factory that points the app's auth context at one member."""
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    def _as(user: User, role: str) -> AsyncClient:
        async def _ctx() -> RequestContext:
            return RequestContext(
                organization_id=shared_org.org.id, user_id=user.id, org_role=role,
            )

        app.dependency_overrides[current_active_user] = lambda: None
        app.dependency_overrides[current_org_member] = _ctx
        return client

    async with client:
        yield _as
    app.dependency_overrides.clear()


async def _reload_schedule(db: AsyncSession, schedule_id: uuid.UUID) -> RentSchedule:
    schedule = await db.get(RentSchedule, schedule_id)
    await db.refresh(schedule)
    return schedule


async def _reload_charge(db: AsyncSession, charge_id: uuid.UUID) -> RentCharge:
    charge = await db.get(RentCharge, charge_id)
    await db.refresh(charge)
    return charge


class TestOtherMemberCannotTouchRentRows:
    @pytest.mark.asyncio
    async def test_cannot_read_ledger(
        self, client_as, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_b, "admin").get(
            f"/rent-ledger/tenants/{a_rows.applicant_id}",
            params={"as_of": utc_today().isoformat()},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_update_schedule(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_b, "admin").patch(
            f"/rent-ledger/schedules/{a_rows.schedule_id}",
            json={"notes": "hijacked", "today": utc_today().isoformat()},
        )
        assert resp.status_code == 404
        assert (await _reload_schedule(db, a_rows.schedule_id)).notes != "hijacked"

    @pytest.mark.asyncio
    async def test_cannot_delete_schedule(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_b, "admin").delete(
            f"/rent-ledger/schedules/{a_rows.schedule_id}",
        )
        assert resp.status_code == 404
        assert (await _reload_schedule(db, a_rows.schedule_id)).deleted_at is None

    @pytest.mark.asyncio
    async def test_cannot_waive_charge(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_b, "admin").post(
            f"/rent-ledger/charges/{a_rows.charge_id}/waive", json={"reason": "not yours"},
        )
        assert resp.status_code == 404
        assert (await _reload_charge(db, a_rows.charge_id)).waived_at is None

    @pytest.mark.asyncio
    async def test_cannot_unwaive_charge(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        waived = await client_as(shared_org.member_a, "owner").post(
            f"/rent-ledger/charges/{a_rows.charge_id}/waive", json={"reason": "comped"},
        )
        assert waived.status_code == 204

        resp = await client_as(shared_org.member_b, "admin").delete(
            f"/rent-ledger/charges/{a_rows.charge_id}/waive",
        )
        assert resp.status_code == 404
        charge = await _reload_charge(db, a_rows.charge_id)
        assert charge.waived_at is not None
        assert charge.waived_reason == "comped"

    @pytest.mark.asyncio
    async def test_cannot_delete_charge(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_b, "admin").delete(
            f"/rent-ledger/charges/{a_rows.charge_id}",
        )
        assert resp.status_code == 404
        assert (await _reload_charge(db, a_rows.charge_id)).deleted_at is None


class TestOwningMemberKeepsAccess:
    @pytest.mark.asyncio
    async def test_can_read_ledger(
        self, client_as, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_a, "owner").get(
            f"/rent-ledger/tenants/{a_rows.applicant_id}",
            params={"as_of": utc_today().isoformat()},
        )
        assert resp.status_code == 200
        assert str(a_rows.charge_id) in {c["id"] for c in resp.json()["charges"]}

    @pytest.mark.asyncio
    async def test_can_update_schedule(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_a, "owner").patch(
            f"/rent-ledger/schedules/{a_rows.schedule_id}",
            json={"notes": "mine", "today": utc_today().isoformat()},
        )
        assert resp.status_code == 200
        assert (await _reload_schedule(db, a_rows.schedule_id)).notes == "mine"

    @pytest.mark.asyncio
    async def test_can_delete_schedule(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_a, "owner").delete(
            f"/rent-ledger/schedules/{a_rows.schedule_id}",
        )
        assert resp.status_code == 204
        assert (await _reload_schedule(db, a_rows.schedule_id)).deleted_at is not None

    @pytest.mark.asyncio
    async def test_can_waive_and_unwaive_charge(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        client = client_as(shared_org.member_a, "owner")
        waived = await client.post(
            f"/rent-ledger/charges/{a_rows.charge_id}/waive", json={"reason": "comped"},
        )
        assert waived.status_code == 204
        assert (await _reload_charge(db, a_rows.charge_id)).waived_at is not None

        restored = await client.delete(f"/rent-ledger/charges/{a_rows.charge_id}/waive")
        assert restored.status_code == 204
        assert (await _reload_charge(db, a_rows.charge_id)).waived_at is None

    @pytest.mark.asyncio
    async def test_can_delete_charge(
        self, client_as, db: AsyncSession, shared_org: SharedOrg, a_rows: TenantRows,
    ) -> None:
        resp = await client_as(shared_org.member_a, "owner").delete(
            f"/rent-ledger/charges/{a_rows.charge_id}",
        )
        assert resp.status_code == 204
        assert (await _reload_charge(db, a_rows.charge_id)).deleted_at is not None
