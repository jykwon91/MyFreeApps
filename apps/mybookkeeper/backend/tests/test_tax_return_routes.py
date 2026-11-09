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
        patch("app.services.tax.tax_validation.unit_of_work", _fake_session),
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

    @pytest.mark.asyncio
    @pytest.mark.parametrize("body", [
        {"tax_year": 2019},
        {"tax_year": 2100},
        {"tax_year": 2025, "filing_status": "married"},
        {"tax_year": 2025, "jurisdiction": ""},
        {"tax_year": 2025, "jurisdiction": "x" * 51},
    ])
    async def test_rejects_what_the_table_would_refuse_422(
        self, client: AsyncClient, body: dict[str, object],
    ) -> None:
        resp = await client.post("/tax-returns", json=body)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    @pytest.mark.parametrize("year", [2020, 2099])
    async def test_accepts_the_first_and_last_allowed_year(self, client: AsyncClient, year: int) -> None:
        resp = await client.post("/tax-returns", json={"tax_year": year, "filing_status": "qualifying_surviving_spouse"})
        assert resp.status_code == 201


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


async def _make_field(
    db: AsyncSession, org: Organization, *, form_name: str, field_id: str, **values: object,
) -> tuple[TaxReturn, TaxFormField]:
    tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
    db.add(tr)
    await db.flush()
    inst = TaxFormInstance(
        id=uuid.uuid4(), tax_return_id=tr.id, form_name=form_name, source_type="extracted",
    )
    db.add(inst)
    await db.flush()
    field = TaxFormField(
        id=uuid.uuid4(), form_instance_id=inst.id, field_id=field_id,
        field_label=field_id, **values,
    )
    db.add(field)
    await db.commit()
    return tr, field


class TestOverrideFieldContract:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("form_name", "field_id", "column", "initial"),
        [
            ("w2", "box_1", "value_numeric", Decimal("100.00")),
            ("w2", "box_14", "value_text", "note"),
            ("w2", "box_13_retirement", "value_boolean", True),
        ],
    )
    async def test_explicit_null_clears_each_column_type(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
        form_name: str, field_id: str, column: str, initial: object,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name=form_name, field_id=field_id, **{column: initial},
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={column: None, "override_reason": "Not on the form"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data[column] is None
        assert data["is_overridden"] is True
        await db.commit()
        await db.refresh(field)
        assert getattr(field, column) is None

    @pytest.mark.asyncio
    async def test_unsent_columns_are_left_unchanged(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="schedule_e", field_id="line_3",
            value_numeric=Decimal("10.00"), value_text="keep me",
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_numeric": 20, "override_reason": "Fix"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert float(data["value_numeric"]) == 20.0
        assert data["value_text"] == "keep me"

    @pytest.mark.asyncio
    async def test_no_value_key_is_rejected(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="w2", field_id="box_1", value_numeric=Decimal("1.00"),
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}", json={"override_reason": "Fix"},
        )
        assert resp.status_code == 422
        await db.refresh(field)
        assert field.is_overridden is False

    @pytest.mark.asyncio
    @pytest.mark.parametrize("field_id", ["recipient_tin", "ssn", "account_number", "issuer_ein"])
    async def test_masked_value_rejected_for_pii_field(
        self, client: AsyncClient, db: AsyncSession, org: Organization, field_id: str,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="1099_int", field_id=field_id, value_text="123456789",
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_text": "***6789", "override_reason": "Echoed"},
        )
        assert resp.status_code == 422
        assert "masked" in resp.json()["detail"]
        await db.refresh(field)
        assert field.value_text == "123456789"
        assert field.is_overridden is False

    @pytest.mark.asyncio
    async def test_full_value_accepted_for_pii_field(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="1099_int", field_id="recipient_tin", value_text="123456789",
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_text": "987654321", "override_reason": "Typo"},
        )
        assert resp.status_code == 200
        assert resp.json()["value_text"] == "987654321"

    @pytest.mark.asyncio
    async def test_masked_looking_text_allowed_for_non_pii_field(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="w2", field_id="box_14", value_text="old",
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_text": "***1234", "override_reason": "Literal note"},
        )
        assert resp.status_code == 200
        assert resp.json()["value_text"] == "***1234"

    @pytest.mark.asyncio
    async def test_wrong_column_for_declared_type_rejected(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr, field = await _make_field(db, org, form_name="w2", field_id="box_1")
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_text": "12,000", "override_reason": "Typed"},
        )
        assert resp.status_code == 422
        assert "value_numeric" in resp.json()["detail"]
        await db.refresh(field)
        assert field.value_text is None
        assert field.is_overridden is False

    @pytest.mark.asyncio
    @pytest.mark.parametrize("reason", ["", "   "])
    async def test_blank_reason_rejected(
        self, client: AsyncClient, db: AsyncSession, org: Organization, reason: str,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="w2", field_id="box_1", value_numeric=Decimal("1.00"),
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}",
            json={"value_numeric": 2, "override_reason": reason},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_reason_rejected(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr, field = await _make_field(
            db, org, form_name="w2", field_id="box_1", value_numeric=Decimal("1.00"),
        )
        resp = await client.patch(
            f"/tax-returns/{tr.id}/fields/{field.id}", json={"value_numeric": 2},
        )
        assert resp.status_code == 422


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
