"""Tests for tax return API routes.

Uses FastAPI TestClient with dependency overrides for auth and org context.
"""
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
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.user.user import User


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="tax-owner@example.com",
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
    o = await organization_repo.create(db, "Tax Test Org", owner.id)
    await db.commit()
    await db.refresh(o)
    return o


@pytest.fixture(autouse=True)
def _patch_sessions(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake_session),
        patch("app.services.tax.tax_return_service.unit_of_work", _fake_session),
        patch("app.services.tax.tax_recompute_service.unit_of_work", _fake_session),
        patch("app.services.tax.tax_validation_service.unit_of_work", _fake_session),
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


class TestListTaxReturns:
    @pytest.mark.asyncio
    async def test_returns_200_empty(self, client: AsyncClient) -> None:
        resp = await client.get("/tax-returns")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_returns_existing(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        resp = await client.get("/tax-returns")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["tax_year"] == 2025


class TestCreateTaxReturn:
    @pytest.mark.asyncio
    async def test_creates_201(self, client: AsyncClient) -> None:
        resp = await client.post("/tax-returns", json={
            "tax_year": 2025,
            "filing_status": "single",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["tax_year"] == 2025
        assert data["filing_status"] == "single"
        assert data["status"] == "draft"

    @pytest.mark.asyncio
    async def test_rejects_duplicate_409(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        resp = await client.post("/tax-returns", json={
            "tax_year": 2025,
        })
        assert resp.status_code == 409


class TestGetTaxReturn:
    @pytest.mark.asyncio
    async def test_returns_by_id(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}")
        assert resp.status_code == 200
        assert resp.json()["tax_year"] == 2025

    @pytest.mark.asyncio
    async def test_returns_404(self, client: AsyncClient) -> None:
        resp = await client.get(f"/tax-returns/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestGetFormInstances:
    @pytest.mark.asyncio
    async def test_returns_chrome_extension_shape(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="schedule_e",
            source_type="computed",
            instance_label="123 Test St",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="line_3",
            field_label="Rents received",
            value_numeric=Decimal("42500.00"),
            is_calculated=True,
        )
        db.add(field)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}/forms/schedule_e")
        assert resp.status_code == 200
        data = resp.json()
        assert data["form_name"] == "schedule_e"
        assert len(data["instances"]) == 1
        assert data["instances"][0]["instance_label"] == "123 Test St"
        assert len(data["instances"][0]["fields"]) == 1
        assert data["instances"][0]["fields"][0]["field_id"] == "line_3"
        assert data["instances"][0]["fields"][0]["value"] == 42500.00
        assert data["instances"][0]["fields"][0]["is_calculated"] is True


class TestRecompute:
    @pytest.mark.asyncio
    async def test_returns_ok(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
            needs_recompute=True,
        )
        db.add(tr)
        await db.commit()

        resp = await client.post(f"/tax-returns/{tr.id}/recompute")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "forms_updated" in data

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.post(f"/tax-returns/{uuid.uuid4()}/recompute")
        assert resp.status_code == 404


class TestOverrideField:
    @pytest.mark.asyncio
    async def test_overrides_field(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="schedule_e",
            source_type="computed",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="line_3",
            field_label="Rents received",
            value_numeric=Decimal("42500.00"),
            is_calculated=True,
        )
        db.add(field)
        await db.commit()

        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_numeric": 45000.0, "override_reason": "Manual fix"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_overridden"] is True
        assert float(data["value_numeric"]) == 45000.0


class TestValidation:
    @pytest.mark.asyncio
    async def test_returns_validation_results(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}/validation")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
