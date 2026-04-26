"""Tests for transaction API routes.

Uses FastAPI TestClient with dependency overrides for auth and org context.
"""
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
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="txn-owner@example.com",
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
    org = await organization_repo.create(db, "Txn Test Org", owner.id)
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
        patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake_session),
        patch("app.services.transactions.transaction_service.unit_of_work", _fake_session),
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


async def _seed_transaction(
    db: AsyncSession,
    org: Organization,
    owner: User,
    *,
    property_id: uuid.UUID | None = None,
    status: str = "pending",
    amount: Decimal = Decimal("100.00"),
    transaction_type: str = "expense",
    category: str = "maintenance",
    tax_year: int = 2025,
    vendor: str = "Test Vendor",
    tax_relevant: bool = False,
    schedule_e_line: str | None = None,
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=owner.id,
        property_id=property_id,
        transaction_date=date(2025, 6, 15),
        tax_year=tax_year,
        vendor=vendor,
        amount=amount,
        transaction_type=transaction_type,
        category=category,
        status=status,
        tax_relevant=tax_relevant,
        schedule_e_line=schedule_e_line,
    )
    await transaction_repo.create(db, txn)
    await db.commit()
    await db.refresh(txn)
    return txn


class TestListTransactions:
    @pytest.mark.asyncio
    async def test_returns_200(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner)
        resp = await client.get("/transactions")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_filters_by_status(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner, status="approved")
        await _seed_transaction(db, org, owner, status="pending", vendor="Pending Co")
        resp = await client.get("/transactions", params={"status": "approved"})
        assert resp.status_code == 200
        data = resp.json()
        assert all(t["status"] == "approved" for t in data)


class TestCreateTransaction:
    @pytest.mark.asyncio
    async def test_creates_manual_transaction(
        self, client: AsyncClient,
    ) -> None:
        resp = await client.post("/transactions", json={
            "transaction_date": "2025-06-15",
            "tax_year": 2025,
            "amount": "150.00",
            "transaction_type": "expense",
            "category": "maintenance",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_manual"] is True
        assert data["amount"] == "150.00"


class TestGetTransaction:
    @pytest.mark.asyncio
    async def test_returns_transaction(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.get(f"/transactions/{txn.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(txn.id)

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.get(f"/transactions/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestUpdateTransaction:
    @pytest.mark.asyncio
    async def test_updates_fields(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.patch(
            f"/transactions/{txn.id}",
            json={"vendor": "Updated Vendor"},
        )
        assert resp.status_code == 200
        assert resp.json()["vendor"] == "Updated Vendor"

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.patch(
            f"/transactions/{uuid.uuid4()}", json={"vendor": "Nope"},
        )
        assert resp.status_code == 404


class TestDeleteTransaction:
    @pytest.mark.asyncio
    async def test_returns_204(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.delete(f"/transactions/{txn.id}")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.delete(f"/transactions/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestBulkApprove:
    @pytest.mark.asyncio
    async def test_approves_eligible(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
        prop: Property,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=prop.id, status="pending")
        resp = await client.post("/transactions/bulk-approve", json={
            "ids": [str(txn.id)],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["approved"] == 1

    @pytest.mark.asyncio
    async def test_skips_without_property(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, status="pending")
        resp = await client.post("/transactions/bulk-approve", json={
            "ids": [str(txn.id)],
        })
        assert resp.status_code == 200
        assert resp.json()["approved"] == 0
        assert resp.json()["skipped"] == 1


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_deletes(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.post("/transactions/bulk-delete", json={
            "ids": [str(txn.id)],
        })
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1


class TestScheduleEReport:
    @pytest.mark.asyncio
    async def test_returns_report(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
        prop: Property,
    ) -> None:
        await _seed_transaction(
            db, org, owner,
            property_id=prop.id,
            status="approved",
            tax_relevant=True,
            tax_year=2025,
            schedule_e_line="line_7_cleaning_maintenance",
            amount=Decimal("200.00"),
        )
        resp = await client.get("/transactions/schedule-e", params={"tax_year": 2025})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["schedule_e_line"] == "line_7_cleaning_maintenance"

    @pytest.mark.asyncio
    async def test_empty_for_no_data(self, client: AsyncClient) -> None:
        resp = await client.get("/transactions/schedule-e", params={"tax_year": 2099})
        assert resp.status_code == 200
        assert resp.json() == []
