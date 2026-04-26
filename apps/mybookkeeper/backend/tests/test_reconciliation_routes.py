"""Tests for reconciliation API routes."""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
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
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.reservation import Reservation
from app.models.user.user import User
from app.repositories import reconciliation_repo, reservation_repo


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="recon-owner@example.com",
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
    org = await organization_repo.create(db, "Recon Test Org", owner.id)
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

    with (
        patch("app.services.transactions.reconciliation_route_service.AsyncSessionLocal", _fake_session),
        patch("app.services.transactions.reconciliation_route_service.unit_of_work", _fake_session),
    ):
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


class TestUpload1099:
    @pytest.mark.asyncio
    async def test_creates_source(self, client: AsyncClient) -> None:
        resp = await client.post("/reconciliation/upload-1099", json={
            "source_type": "1099_k",
            "tax_year": 2025,
            "issuer": "Airbnb",
            "reported_amount": "10000.00",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["source_type"] == "1099_k"
        assert data["tax_year"] == 2025
        assert data["issuer"] == "Airbnb"
        assert data["status"] == "unmatched"

    @pytest.mark.asyncio
    async def test_creates_without_issuer(self, client: AsyncClient) -> None:
        resp = await client.post("/reconciliation/upload-1099", json={
            "source_type": "1099_misc",
            "tax_year": 2025,
            "reported_amount": "5000.00",
        })
        assert resp.status_code == 201
        assert resp.json()["issuer"] is None


class TestListSources:
    @pytest.mark.asyncio
    async def test_returns_sources(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
    ) -> None:
        source = ReconciliationSource(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            source_type="1099_k",
            tax_year=2025,
            reported_amount=Decimal("10000.00"),
        )
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        resp = await client.get("/reconciliation/sources", params={"tax_year": 2025})
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_empty_for_wrong_year(self, client: AsyncClient) -> None:
        resp = await client.get("/reconciliation/sources", params={"tax_year": 2099})
        assert resp.status_code == 200
        assert resp.json() == []


class TestListDiscrepancies:
    @pytest.mark.asyncio
    async def test_returns_unmatched(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
    ) -> None:
        source = ReconciliationSource(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            source_type="1099_k",
            tax_year=2025,
            reported_amount=Decimal("10000.00"),
            status="unmatched",
        )
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        resp = await client.get("/reconciliation/discrepancies", params={"tax_year": 2025})
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_excludes_matched(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
    ) -> None:
        source = ReconciliationSource(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            source_type="1099_k",
            tax_year=2025,
            reported_amount=Decimal("10000.00"),
            matched_amount=Decimal("10000.00"),
            status="matched",
        )
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        resp = await client.get("/reconciliation/discrepancies", params={"tax_year": 2025})
        assert resp.status_code == 200
        assert len(resp.json()) == 0


class TestCreateMatch:
    @pytest.mark.asyncio
    async def test_creates_match(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
        prop: Property,
    ) -> None:
        source = ReconciliationSource(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            source_type="1099_k",
            tax_year=2025,
            reported_amount=Decimal("10000.00"),
        )
        await reconciliation_repo.create_source(db, source)

        res = Reservation(
            id=uuid.uuid4(),
            organization_id=org.id,
            property_id=prop.id,
            res_code="MATCH-RES-001",
            check_in=date(2025, 6, 1),
            check_out=date(2025, 6, 5),
            gross_booking=Decimal("500.00"),
            platform="airbnb",
        )
        await reservation_repo.create(db, res)
        await db.commit()

        resp = await client.post("/reconciliation/match", json={
            "reconciliation_source_id": str(source.id),
            "reservation_id": str(res.id),
            "matched_amount": "500.00",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["matched_amount"] == "500.00"
        assert data["reservation_id"] == str(res.id)

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_source(
        self, client: AsyncClient,
    ) -> None:
        resp = await client.post("/reconciliation/match", json={
            "reconciliation_source_id": str(uuid.uuid4()),
            "reservation_id": str(uuid.uuid4()),
            "matched_amount": "100.00",
        })
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_reservation(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
    ) -> None:
        source = ReconciliationSource(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            source_type="1099_k",
            tax_year=2025,
            reported_amount=Decimal("5000.00"),
        )
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        resp = await client.post("/reconciliation/match", json={
            "reconciliation_source_id": str(source.id),
            "reservation_id": str(uuid.uuid4()),
            "matched_amount": "100.00",
        })
        assert resp.status_code == 404
