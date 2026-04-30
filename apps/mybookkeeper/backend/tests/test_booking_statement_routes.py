"""Tests for booking statement API routes."""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.booking_statement import BookingStatement
from app.models.user.user import User
from app.repositories import booking_statement_repo


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="bs-owner@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner: User) -> Organization:
    from app.repositories import organization_repo
    org = await organization_repo.create(db, "BS Test Org", owner.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture()
async def prop(db: AsyncSession, org: Organization, owner: User) -> Property:
    p = Property(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=owner.id,
        name="Test Property",
        type=PropertyType.SHORT_TERM,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest.fixture(autouse=True)
def _patch_service_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with patch("app.services.transactions.booking_statement_query_service.AsyncSessionLocal", _fake_session):
        yield


def _override_org_member(user: User, org: Organization):
    async def _dep():
        return RequestContext(
            organization_id=org.id,
            user_id=user.id,
            org_role="owner",
        )
    return _dep


@pytest_asyncio.fixture()
async def client(owner: User, org: Organization):
    from app.core.auth import current_active_user as cau

    app.dependency_overrides[cau] = lambda: None
    app.dependency_overrides[current_org_member] = _override_org_member(owner, org)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


async def _seed_booking_statement(
    db: AsyncSession,
    org: Organization,
    prop: Property,
    *,
    res_code: str = "RES001",
    check_in: date = date(2025, 6, 1),
    check_out: date = date(2025, 6, 5),
    gross_booking: Decimal = Decimal("500.00"),
) -> BookingStatement:
    bs = BookingStatement(
        id=uuid.uuid4(),
        organization_id=org.id,
        property_id=prop.id,
        res_code=res_code,
        check_in=check_in,
        check_out=check_out,
        gross_booking=gross_booking,
        platform="airbnb",
    )
    await booking_statement_repo.create(db, bs)
    await db.commit()
    await db.refresh(bs)
    return bs


class TestListBookingStatements:
    @pytest.mark.asyncio
    async def test_returns_200(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        prop: Property,
    ) -> None:
        await _seed_booking_statement(db, org, prop)
        resp = await client.get("/booking-statements")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_filters_by_property(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        prop: Property,
    ) -> None:
        await _seed_booking_statement(db, org, prop)
        resp = await client.get("/booking-statements", params={"property_id": str(prop.id)})
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["property_id"] == str(prop.id) for r in data)

    @pytest.mark.asyncio
    async def test_empty_when_none(self, client: AsyncClient) -> None:
        resp = await client.get("/booking-statements")
        assert resp.status_code == 200
        assert resp.json() == []


class TestOccupancyStats:
    @pytest.mark.asyncio
    async def test_returns_stats(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        prop: Property,
    ) -> None:
        await _seed_booking_statement(
            db, org, prop,
            check_in=date(2025, 6, 1),
            check_out=date(2025, 6, 5),
        )
        resp = await client.get("/booking-statements/occupancy", params={
            "property_id": str(prop.id),
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "total_nights" in data
        assert "occupancy_rate" in data
        assert "total_days" in data
        assert "reservation_count" in data

    @pytest.mark.asyncio
    async def test_rejects_invalid_date_range(
        self, client: AsyncClient, prop: Property,
    ) -> None:
        resp = await client.get("/booking-statements/occupancy", params={
            "property_id": str(prop.id),
            "start_date": "2025-12-31",
            "end_date": "2025-01-01",
        })
        assert resp.status_code == 422
