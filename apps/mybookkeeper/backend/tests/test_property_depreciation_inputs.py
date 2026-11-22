"""Saving a property's land value and date placed in service.

They feed Form 4562 and so Schedule E line 18, so a bad pair is refused with a
message (rather than the database's 500), and a change marks unfiled returns as
needing a recompute.
"""
import datetime
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext, worker_context
from app.core.depreciation_input_constants import (
    LAND_VALUE_NEEDS_PRICE,
    LAND_VALUE_OVER_PRICE,
    PLACED_IN_SERVICE_IN_FUTURE,
)
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property, PropertyType
from app.models.properties.property_classification import PropertyClassification
from app.models.requests.property_create import PropertyCreate
from app.models.requests.property_update import PropertyUpdate
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.services.properties import property_service


def _rental(org: Organization, user: User, **kwargs) -> Property:
    values = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Peerless",
        address="6734 Peerless St",
        classification=PropertyClassification.INVESTMENT,
        type=PropertyType.LONG_TERM,
        purchase_price=Decimal("300000.00"),
    )
    values.update(kwargs)
    return Property(**values)


def _return(org: Organization, tax_year: int, status: str) -> TaxReturn:
    return TaxReturn(
        id=uuid.uuid4(), organization_id=org.id, tax_year=tax_year,
        filing_status="single", status=status, needs_recompute=False,
    )


async def _update(db: AsyncSession, org: Organization, user: User, prop: Property, updates: dict) -> Property | None:
    @asynccontextmanager
    async def _fake():
        yield db

    ctx = worker_context(organization_id=org.id, user_id=user.id)
    with patch("app.services.properties.property_service.unit_of_work", _fake):
        return await property_service.update_property(ctx, prop.id, updates)


class TestLandValue:
    @pytest.mark.asyncio
    async def test_saves_land_value_and_date_placed_in_service(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user)
        db.add(prop)
        await db.flush()

        saved = await _update(db, test_org, test_user, prop, {
            "land_value": Decimal("25000.00"),
            "date_placed_in_service": datetime.date(2023, 3, 15),
        })

        assert saved is not None
        assert saved.land_value == Decimal("25000.00")
        assert saved.date_placed_in_service == datetime.date(2023, 3, 15)

    @pytest.mark.asyncio
    async def test_refuses_land_worth_more_than_the_purchase_price(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user)
        db.add(prop)
        await db.flush()

        with pytest.raises(ValueError, match=LAND_VALUE_OVER_PRICE):
            await _update(db, test_org, test_user, prop, {"land_value": Decimal("300000.01")})

    @pytest.mark.asyncio
    async def test_refuses_lowering_the_price_below_the_saved_land_value(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user, land_value=Decimal("50000.00"))
        db.add(prop)
        await db.flush()

        with pytest.raises(ValueError, match=LAND_VALUE_OVER_PRICE):
            await _update(db, test_org, test_user, prop, {"purchase_price": Decimal("40000.00")})

    @pytest.mark.asyncio
    async def test_refuses_land_value_without_a_purchase_price(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user, purchase_price=None)
        db.add(prop)
        await db.flush()

        with pytest.raises(ValueError, match=LAND_VALUE_NEEDS_PRICE):
            await _update(db, test_org, test_user, prop, {"land_value": Decimal("1000.00")})

    def test_request_refuses_negative_land_value(self) -> None:
        with pytest.raises(ValidationError):
            PropertyUpdate(land_value=Decimal("-1"))

    def test_request_accepts_zero_land_value(self) -> None:
        assert PropertyUpdate(land_value=Decimal("0")).land_value == Decimal("0")


class TestPurchasePriceOnCreate:
    @pytest.mark.asyncio
    async def test_create_persists_the_purchase_price(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        @asynccontextmanager
        async def _fake():
            yield db

        ctx = worker_context(organization_id=test_org.id, user_id=test_user.id)
        with patch("app.services.properties.property_service.unit_of_work", _fake):
            created = await property_service.create_property(
                ctx, "Priced", "1 Main St", PropertyClassification.INVESTMENT,
                PropertyType.LONG_TERM, Decimal("250000.00"),
            )

        assert created.purchase_price == Decimal("250000.00")

    def test_request_accepts_a_purchase_price(self) -> None:
        data = PropertyCreate(name="A", address="B", purchase_price=Decimal("250000.00"))
        assert data.purchase_price == Decimal("250000.00")

    @pytest.mark.parametrize("bad", ["lots", "-1", "-0.01", "10000000000.00", "100.123"])
    def test_create_refuses_a_bad_purchase_price(self, bad: str) -> None:
        with pytest.raises(ValidationError):
            PropertyCreate(name="A", address="B", purchase_price=bad)  # type: ignore[arg-type]

    @pytest.mark.parametrize("bad", ["lots", "-1", "-0.01", "10000000000.00", "100.123"])
    def test_update_refuses_a_bad_purchase_price(self, bad: str) -> None:
        with pytest.raises(ValidationError):
            PropertyUpdate(purchase_price=bad)  # type: ignore[arg-type]

    @pytest.mark.parametrize("good", ["0", "250000", "250000.00", "9999999999.99"])
    def test_both_accept_a_valid_purchase_price(self, good: str) -> None:
        assert PropertyCreate(name="A", address="B", purchase_price=good).purchase_price == Decimal(good)  # type: ignore[arg-type]
        assert PropertyUpdate(purchase_price=good).purchase_price == Decimal(good)  # type: ignore[arg-type]

    @pytest.mark.parametrize("bad", ["lots", "-1", "10000000000.00", "100.123"])
    def test_update_refuses_a_bad_land_value(self, bad: str) -> None:
        with pytest.raises(ValidationError):
            PropertyUpdate(land_value=bad)  # type: ignore[arg-type]

    @pytest.mark.parametrize("good", ["0", "25000.00", "9999999999.99"])
    def test_update_accepts_a_valid_land_value(self, good: str) -> None:
        assert PropertyUpdate(land_value=good).land_value == Decimal(good)  # type: ignore[arg-type]


class TestDatePlacedInService:
    def test_refuses_a_future_date(self) -> None:
        future = datetime.date.today() + datetime.timedelta(days=30)
        with pytest.raises(ValidationError, match=PLACED_IN_SERVICE_IN_FUTURE):
            PropertyUpdate(date_placed_in_service=future)

    def test_accepts_today(self) -> None:
        today = datetime.datetime.now(datetime.timezone.utc).date()
        assert PropertyUpdate(date_placed_in_service=today).date_placed_in_service == today


class TestUnfiledReturnsGoStale:
    @pytest.mark.asyncio
    async def test_changing_land_value_flags_unfiled_returns_only(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user)
        unfiled = _return(test_org, 2025, "draft")
        filed = _return(test_org, 2024, "filed")
        db.add_all([prop, unfiled, filed])
        await db.flush()

        await _update(db, test_org, test_user, prop, {"land_value": Decimal("25000.00")})
        await db.refresh(unfiled)
        await db.refresh(filed)

        assert unfiled.needs_recompute is True
        assert filed.needs_recompute is False

    @pytest.mark.asyncio
    async def test_changing_the_date_placed_in_service_flags_unfiled_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user)
        unfiled = _return(test_org, 2025, "draft")
        db.add_all([prop, unfiled])
        await db.flush()

        await _update(db, test_org, test_user, prop, {"date_placed_in_service": datetime.date(2023, 3, 15)})
        await db.refresh(unfiled)

        assert unfiled.needs_recompute is True

    @pytest.mark.asyncio
    async def test_deactivating_a_rental_flags_unfiled_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user)
        unfiled = _return(test_org, 2025, "draft")
        db.add_all([prop, unfiled])
        await db.flush()

        await _update(db, test_org, test_user, prop, {"is_active": False})
        await db.refresh(unfiled)

        assert unfiled.needs_recompute is True

    @pytest.mark.asyncio
    async def test_a_rename_leaves_returns_alone(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user, land_value=Decimal("25000.00"))
        unfiled = _return(test_org, 2025, "draft")
        db.add_all([prop, unfiled])
        await db.flush()

        await _update(db, test_org, test_user, prop, {"name": "Peerless St", "land_value": Decimal("25000.00")})
        await db.refresh(unfiled)

        assert unfiled.needs_recompute is False


class TestPatchRoute:
    def test_a_refused_land_value_comes_back_as_a_422_with_the_reason(self) -> None:
        ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
        app.dependency_overrides[current_org_member] = lambda: ctx
        try:
            with patch(
                "app.api.properties.property_service.update_property",
                side_effect=ValueError(LAND_VALUE_OVER_PRICE),
            ):
                response = TestClient(app).patch(f"/properties/{uuid.uuid4()}", json={"land_value": "400000"})
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 422
        assert response.json()["detail"] == LAND_VALUE_OVER_PRICE


class TestPostRoute:
    @staticmethod
    def _post(body: dict) -> tuple[int, dict | None]:
        ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
        app.dependency_overrides[require_write_access] = lambda: ctx
        try:
            with patch("app.api.properties.property_service.create_property") as create:
                create.side_effect = ValueError("stop")
                response = TestClient(app).post("/properties", json=body)
                sent = create.call_args.args if create.called else None
        finally:
            app.dependency_overrides.clear()
        return response.status_code, sent

    def test_the_price_is_handed_to_the_service(self) -> None:
        _, sent = self._post({"name": "A", "address": "B", "purchase_price": "250000.00"})

        assert sent is not None
        assert sent[-1] == Decimal("250000.00")

    def test_a_non_numeric_price_is_refused_with_a_422(self) -> None:
        status, sent = self._post({"name": "A", "address": "B", "purchase_price": "lots"})

        assert status == 422
        assert sent is None
