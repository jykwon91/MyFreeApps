"""The rent ledger and schedule saves use the host's local date, sent by the client.

Production runs in UTC, so a US host reading the ledger in the evening used to
see tomorrow's period and overdue status. The ledger GET now requires
``as_of`` and schedule saves require ``today``. A past ``as_of`` shows rent
begun by then without deleting later charges; nothing later than any real
local date is accepted, since missing charges are generated up to it.
"""
from __future__ import annotations

import datetime
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.rent.rent_charge import RentCharge
from app.models.organization.organization_member import OrgRole
from app.schemas.rent.rent_ledger_as_of import RentLedgerAsOf
from app.schemas.rent.rent_ledger_response import RentLedgerResponse
from app.services.rent import rent_ledger_service, rent_schedule_service
from tests.utc_today import utc_today

_SERVICE = "app.api.rent_ledger.rent_ledger_service.get_ledger"


class TestRentLedgerAsOf:
    @pytest.mark.parametrize("offset", [-400, -2, -1, 0, 1])
    def test_accepts_past_dates_and_any_real_local_today(self, offset: int) -> None:
        value = utc_today() + datetime.timedelta(days=offset)
        assert TypeAdapter(RentLedgerAsOf).validate_python(value) == value

    @pytest.mark.parametrize("offset", [2, 30])
    def test_rejects_dates_later_than_any_local_today(self, offset: int) -> None:
        with pytest.raises(ValidationError):
            TypeAdapter(RentLedgerAsOf).validate_python(
                utc_today() + datetime.timedelta(days=offset),
            )


@pytest.fixture
def client():
    ctx = RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    app.dependency_overrides[current_org_member] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _ledger(applicant_id: uuid.UUID, as_of: datetime.date) -> RentLedgerResponse:
    zero = Decimal("0.00")
    return RentLedgerResponse(
        applicant_id=applicant_id, as_of=as_of, schedules=[], charges=[], payments=[],
        total_charged=zero, total_paid=zero, balance=zero, unapplied_credit=zero,
    )


class TestLedgerRouteRequiresAsOf:
    @pytest.mark.parametrize("offset", [-60, -1, 0, 1])
    def test_passes_as_of_to_service(self, client: TestClient, offset: int) -> None:
        applicant_id = uuid.uuid4()
        as_of = utc_today() + datetime.timedelta(days=offset)
        with patch(
            _SERVICE, new_callable=AsyncMock, return_value=_ledger(applicant_id, as_of),
        ) as service:
            resp = client.get(
                f"/rent-ledger/tenants/{applicant_id}", params={"as_of": as_of.isoformat()},
            )
        assert resp.status_code == 200, resp.text
        assert service.await_args.kwargs["as_of"] == as_of

    @pytest.mark.parametrize("offset", [None, 2])
    def test_missing_or_future_as_of_is_422(self, client: TestClient, offset: int | None) -> None:
        params = (
            {} if offset is None
            else {"as_of": (utc_today() + datetime.timedelta(days=offset)).isoformat()}
        )
        with patch(_SERVICE, new_callable=AsyncMock) as service:
            resp = client.get(f"/rent-ledger/tenants/{uuid.uuid4()}", params=params)
        assert resp.status_code == 422
        service.assert_not_awaited()


def _schedule_body(today: datetime.date | None) -> dict[str, object]:
    body: dict[str, object] = {
        "applicant_id": str(uuid.uuid4()), "amount": "1500.00", "cadence": "monthly",
        "start_date": "2026-08-01",
    }
    if today is not None:
        body["today"] = today.isoformat()
    return body


def _post_schedule(client: TestClient, today: datetime.date | None):
    return client.post("/rent-ledger/schedules", json=_schedule_body(today))


def _patch_schedule(client: TestClient, today: datetime.date | None):
    body = {} if today is None else {"today": today.isoformat()}
    return client.patch(f"/rent-ledger/schedules/{uuid.uuid4()}", json={"notes": "x", **body})


_SCHEDULE_ROUTES = [
    (_post_schedule, "app.api.rent_ledger.rent_schedule_service.create_schedule"),
    (_patch_schedule, "app.api.rent_ledger.rent_schedule_service.update_schedule"),
]
_NOT_FOUND = {
    "app.api.rent_ledger.rent_schedule_service.create_schedule":
        rent_schedule_service.TenantNotFoundError("stop here"),
    "app.api.rent_ledger.rent_schedule_service.update_schedule":
        rent_schedule_service.ScheduleNotFoundError("stop here"),
}


@pytest.fixture
def writer_client():
    ctx = RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestScheduleRoutesRequireClientDate:
    @pytest.mark.parametrize(("call", "target"), _SCHEDULE_ROUTES)
    @pytest.mark.parametrize("offset", [-1, 0, 1])
    def test_passes_client_date_to_service(
        self, writer_client: TestClient, call, target: str, offset: int,
    ) -> None:
        today = utc_today() + datetime.timedelta(days=offset)
        with patch(target, new_callable=AsyncMock, side_effect=_NOT_FOUND[target]) as service:
            resp = call(writer_client, today)
        assert resp.status_code == 404, resp.text
        assert service.await_args.kwargs["today"] == today

    @pytest.mark.parametrize(("call", "target"), _SCHEDULE_ROUTES)
    @pytest.mark.parametrize("offset", [None, -2, 2])
    def test_missing_or_far_off_date_is_422(
        self, writer_client: TestClient, call, target: str, offset: int | None,
    ) -> None:
        today = None if offset is None else utc_today() + datetime.timedelta(days=offset)
        with patch(target, new_callable=AsyncMock) as service:
            resp = call(writer_client, today)
        assert resp.status_code == 422
        service.assert_not_awaited()


_ORG = uuid.uuid4()
_USER = uuid.uuid4()


async def _tenant(db: AsyncSession) -> uuid.UUID:
    applicant = Applicant(id=uuid.uuid4(), organization_id=_ORG, user_id=_USER, stage="lease_signed")
    db.add(applicant)
    await db.flush()
    return applicant.id


def _uow(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db
    return _fake


def _patch_uow(db: AsyncSession):
    fake = _uow(db)
    return (
        patch("app.services.rent.rent_ledger_service.unit_of_work", fake),
        patch("app.services.rent.rent_schedule_service.unit_of_work", fake),
    )


async def _create_schedule(db: AsyncSession, applicant_id: uuid.UUID, *, today: datetime.date):
    ledger_patch, schedule_patch = _patch_uow(db)
    with ledger_patch, schedule_patch:
        return await rent_schedule_service.create_schedule(
            organization_id=_ORG, user_id=_USER, applicant_id=applicant_id,
            amount=Decimal("1500.00"), cadence="monthly",
            start_date=datetime.date(2026, 8, 1), today=today,
        )


async def _ledger_on(db: AsyncSession, applicant_id: uuid.UUID, as_of: datetime.date):
    ledger_patch, _ = _patch_uow(db)
    with ledger_patch:
        return await rent_ledger_service.get_ledger(
            organization_id=_ORG, user_id=_USER, applicant_id=applicant_id, as_of=as_of,
        )


async def _all_charge_rows(db: AsyncSession, applicant_id: uuid.UUID):
    """Every row, soft-deleted included, as ``(id, period_start, deleted_at)``."""
    rows = (
        await db.execute(
            select(RentCharge).where(RentCharge.applicant_id == applicant_id)
            .order_by(RentCharge.period_start),
        )
    ).scalars().all()
    return [(r.id, r.period_start, r.deleted_at) for r in rows]


class TestServiceUsesPassedDate:
    def test_ledger_as_of_is_a_required_keyword(self) -> None:
        with pytest.raises(TypeError):
            rent_ledger_service.get_ledger(  # type: ignore[call-arg]
                organization_id=uuid.uuid4(), user_id=uuid.uuid4(), applicant_id=uuid.uuid4(),
            )

    def test_generation_horizon_is_a_required_keyword(self) -> None:
        with pytest.raises(TypeError):
            rent_ledger_service.ensure_charges_generated(  # type: ignore[call-arg]
                None, organization_id=uuid.uuid4(), applicant_id=uuid.uuid4(),
            )

    @pytest.mark.parametrize("save", ["create_schedule", "update_schedule"])
    def test_schedule_saves_require_the_hosts_date(self, save: str) -> None:
        with pytest.raises(TypeError, match="today"):
            getattr(rent_schedule_service, save)(organization_id=uuid.uuid4(), user_id=uuid.uuid4())

    @pytest.mark.asyncio
    async def test_saving_a_schedule_writes_no_charge_past_the_hosts_date(
        self, db: AsyncSession,
    ) -> None:
        # The server's UTC clock may already say September 1st; the host is on August 31st.
        host_today = datetime.date(2026, 8, 31)
        applicant_id = await _tenant(db)
        schedule = await _create_schedule(db, applicant_id, today=host_today)

        ledger_patch, schedule_patch = _patch_uow(db)
        with ledger_patch, schedule_patch:
            await rent_schedule_service.update_schedule(
                organization_id=_ORG, user_id=_USER, schedule_id=schedule.id,
                today=host_today, notes="Pays weekly", fields_set={"notes"},
            )

        rows = await _all_charge_rows(db, applicant_id)
        assert [(start, deleted) for _id, start, deleted in rows] == [
            (datetime.date(2026, 8, 1), None),
        ]

        ledger = await _ledger_on(db, applicant_id, host_today)
        assert ledger.as_of == host_today
        assert ledger.current_period is not None
        assert ledger.current_period.label == "August 2026"
        assert ledger.total_charged == Decimal("1500.00")
        assert await _all_charge_rows(db, applicant_id) == rows


class TestPastDateView:
    @pytest.mark.asyncio
    async def test_a_past_date_read_leaves_later_charges_intact(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _tenant(db)
        await _create_schedule(db, applicant_id, today=datetime.date(2026, 10, 15))
        before = await _all_charge_rows(db, applicant_id)
        assert [start for _id, start, _deleted in before] == [
            datetime.date(2026, 8, 1), datetime.date(2026, 9, 1), datetime.date(2026, 10, 1),
        ]

        await _ledger_on(db, applicant_id, datetime.date(2026, 8, 20))
        await _ledger_on(db, applicant_id, datetime.date(2026, 10, 15))

        # Same rows, none soft-deleted, none recreated.
        assert await _all_charge_rows(db, applicant_id) == before

    @pytest.mark.asyncio
    async def test_a_past_date_view_shows_only_rent_begun_by_then(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _tenant(db)
        await _create_schedule(db, applicant_id, today=datetime.date(2026, 10, 15))
        _ledger_patch, schedule_patch = _patch_uow(db)
        with schedule_patch:
            september = next(
                c for c in (await _all_charge_rows(db, applicant_id))
                if c[1] == datetime.date(2026, 9, 1)
            )
            await rent_schedule_service.waive_charge(
                organization_id=_ORG, charge_id=september[0], reason="Away",
            )
            # One-off charges are host entries and show whatever their date.
            await rent_schedule_service.add_charge(
                organization_id=_ORG, user_id=_USER, applicant_id=applicant_id,
                amount=Decimal("40.00"), due_date=datetime.date(2026, 9, 6),
                charge_type="late_fee",
            )

        past = await _ledger_on(db, applicant_id, datetime.date(2026, 8, 20))
        assert [(c.charge_type, c.period_start) for c in past.charges] == [
            ("rent", datetime.date(2026, 8, 1)), ("late_fee", datetime.date(2026, 9, 6)),
        ]
        assert past.total_charged == Decimal("1540.00")
        assert past.current_period is not None
        assert past.current_period.label == "August 2026"

        current = await _ledger_on(db, applicant_id, datetime.date(2026, 10, 15))
        assert len(current.charges) == 4
        assert current.total_charged == Decimal("3040.00")

    @pytest.mark.asyncio
    async def test_a_past_date_read_writes_nothing_after_that_date(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _tenant(db)
        await _create_schedule(db, applicant_id, today=datetime.date(2026, 10, 15))
        september = next(
            c for c in (await _all_charge_rows(db, applicant_id))
            if c[1] == datetime.date(2026, 9, 1)
        )
        _ledger_patch, schedule_patch = _patch_uow(db)
        with schedule_patch:
            await rent_schedule_service.delete_charge(organization_id=_ORG, charge_id=september[0])
        before = await _all_charge_rows(db, applicant_id)

        await _ledger_on(db, applicant_id, datetime.date(2026, 8, 20))

        assert await _all_charge_rows(db, applicant_id) == before

    @pytest.mark.asyncio
    async def test_end_date_change_reconciles_charges_after_the_save_date(
        self, db: AsyncSession,
    ) -> None:
        """Charges already written past ``through`` are retimed or retired by the
        schedule's new end date, not deleted for starting after ``through``."""
        applicant_id = await _tenant(db)
        schedule = await _create_schedule(db, applicant_id, today=datetime.date(2026, 10, 15))
        ids = {start: charge_id for charge_id, start, _deleted in await _all_charge_rows(db, applicant_id)}

        ledger_patch, schedule_patch = _patch_uow(db)
        with ledger_patch, schedule_patch:
            await rent_schedule_service.update_schedule(
                organization_id=_ORG, user_id=_USER, schedule_id=schedule.id,
                today=datetime.date(2026, 8, 20), end_date=datetime.date(2026, 9, 15),
                fields_set={"end_date"},
            )

        async def _rows():
            return [
                (r.id, r.period_start, r.period_end, r.amount, r.deleted_at is None)
                for r in (
                    await db.execute(
                        select(RentCharge).where(RentCharge.applicant_id == applicant_id)
                        .order_by(RentCharge.period_start),
                    )
                ).scalars().all()
            ]

        after_save = await _rows()
        assert after_save == [
            (ids[datetime.date(2026, 8, 1)], datetime.date(2026, 8, 1),
             datetime.date(2026, 8, 31), Decimal("1500.00"), True),
            # Begins after the save date, still produced: retimed in place.
            (ids[datetime.date(2026, 9, 1)], datetime.date(2026, 9, 1),
             datetime.date(2026, 9, 15), Decimal("750.00"), True),
            # Past the new end date: retired.
            (ids[datetime.date(2026, 10, 1)], datetime.date(2026, 10, 1),
             datetime.date(2026, 10, 31), Decimal("1500.00"), False),
        ]

        await _ledger_on(db, applicant_id, datetime.date(2026, 8, 20))
        assert await _rows() == after_save
