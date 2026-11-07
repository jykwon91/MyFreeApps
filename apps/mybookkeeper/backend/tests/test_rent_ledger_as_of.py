"""The rent ledger is evaluated as of the host's local date, sent by the client.

Production runs in UTC, so a US host reading the ledger in the evening used to
see tomorrow's period and overdue status. The ledger GET now requires
``as_of``; past dates are allowed (the ledger as it stood), but nothing later
than any real local date, since charges are generated up to it.
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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.organization.organization_member import OrgRole
from app.schemas.rent.rent_ledger_as_of import RentLedgerAsOf
from app.schemas.rent.rent_ledger_response import RentLedgerResponse
from app.services.rent import rent_ledger_service, rent_schedule_service

_SERVICE = "app.api.rent_ledger.rent_ledger_service.get_ledger"


def _utc_today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()


class TestRentLedgerAsOf:
    @pytest.mark.parametrize("offset", [-400, -2, -1, 0, 1])
    def test_accepts_past_dates_and_any_real_local_today(self, offset: int) -> None:
        value = _utc_today() + datetime.timedelta(days=offset)
        assert TypeAdapter(RentLedgerAsOf).validate_python(value) == value

    @pytest.mark.parametrize("offset", [2, 30])
    def test_rejects_dates_later_than_any_local_today(self, offset: int) -> None:
        with pytest.raises(ValidationError):
            TypeAdapter(RentLedgerAsOf).validate_python(
                _utc_today() + datetime.timedelta(days=offset),
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
        as_of = _utc_today() + datetime.timedelta(days=offset)
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
            else {"as_of": (_utc_today() + datetime.timedelta(days=offset)).isoformat()}
        )
        with patch(_SERVICE, new_callable=AsyncMock) as service:
            resp = client.get(f"/rent-ledger/tenants/{uuid.uuid4()}", params=params)
        assert resp.status_code == 422
        service.assert_not_awaited()


class TestServiceUsesPassedDate:
    def test_as_of_is_a_required_keyword(self) -> None:
        with pytest.raises(TypeError):
            rent_ledger_service.get_ledger(  # type: ignore[call-arg]
                organization_id=uuid.uuid4(), user_id=uuid.uuid4(), applicant_id=uuid.uuid4(),
            )

    @pytest.mark.asyncio
    async def test_ledger_is_evaluated_on_the_passed_date(self, db: AsyncSession) -> None:
        org, user = uuid.uuid4(), uuid.uuid4()
        applicant = Applicant(id=uuid.uuid4(), organization_id=org, user_id=user, stage="lease_signed")
        db.add(applicant)
        await db.flush()

        @asynccontextmanager
        async def _uow():
            yield db

        # The server's clock says September 1st; the host is still on August 31st.
        server_today = datetime.date(2026, 9, 1)
        host_today = datetime.date(2026, 8, 31)
        with patch("app.services.rent.rent_ledger_service.unit_of_work", _uow), \
                patch("app.services.rent.rent_schedule_service.unit_of_work", _uow), \
                patch.object(rent_ledger_service, "_today", lambda: server_today):
            await rent_schedule_service.create_schedule(
                organization_id=org, user_id=user, applicant_id=applicant.id,
                amount=Decimal("1500.00"), cadence="monthly",
                start_date=datetime.date(2026, 8, 1),
            )
            ledger = await rent_ledger_service.get_ledger(
                organization_id=org, user_id=user, applicant_id=applicant.id, as_of=host_today,
            )

        assert ledger.as_of == host_today
        assert ledger.current_period is not None
        assert ledger.current_period.label == "August 2026"
        # September's charge, written against the server's date when the schedule
        # was saved, is not owed yet on the host's date.
        assert [c.period_start for c in ledger.charges] == [datetime.date(2026, 8, 1)]
        assert ledger.total_charged == Decimal("1500.00")
