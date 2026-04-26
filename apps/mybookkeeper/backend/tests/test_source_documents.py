"""Tests for GET /tax-returns/{return_id}/source-documents endpoint."""
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
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.reservation import Reservation
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.tax import tax_return_service


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="source-docs-owner@example.com",
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
    o = await organization_repo.create(db, "Source Docs Org", owner.id)
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


def _make_ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role="owner",
    )


class TestSourceDocumentsRoute:
    @pytest.mark.asyncio
    async def test_returns_404_for_missing_return(self, client: AsyncClient) -> None:
        resp = await client.get(f"/tax-returns/{uuid.uuid4()}/source-documents")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_documents(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}/source-documents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["documents"] == []
        assert data["checklist"] == []

    @pytest.mark.asyncio
    async def test_returns_linked_document(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name="1099-MISC-Vello.pdf",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="1099_misc",
            source_type="extracted",
            document_id=doc.id,
            issuer_name="Vello LLC",
            issuer_ein="87-1674733",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="box_1",
            field_label="Box 1 - Rents",
            value_numeric=Decimal("45724.88"),
        )
        db.add(field)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}/source-documents")
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["documents"]) == 1
        doc_data = data["documents"][0]
        assert doc_data["document_id"] == str(doc.id)
        assert doc_data["file_name"] == "1099-MISC-Vello.pdf"
        assert doc_data["document_type"] == "1099_misc"
        assert doc_data["issuer_name"] == "Vello LLC"
        assert doc_data["issuer_ein"] in ("87-1674733", "***4733")
        assert doc_data["key_amount"] == 45724.88
        assert doc_data["form_instance_id"] == str(inst.id)


class TestSourceDocumentsService:
    @pytest.mark.asyncio
    async def test_empty_return(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)
        assert result.documents == []
        assert result.checklist == []

    @pytest.mark.asyncio
    async def test_raises_for_missing_return(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        with pytest.raises(LookupError, match="not found"):
            await tax_return_service.get_source_documents(ctx, uuid.uuid4())

    @pytest.mark.asyncio
    async def test_excludes_computed_forms(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        """Computed forms like schedule_e should not appear in source documents."""
        ctx = _make_ctx(org, owner)
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

        result = await tax_return_service.get_source_documents(ctx, tr.id)
        assert result.documents == []

    @pytest.mark.asyncio
    async def test_checklist_detects_missing_1099k_from_reservations(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        """Reservations with platform should generate a 1099-K checklist item."""
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        res = Reservation(
            id=uuid.uuid4(),
            organization_id=org.id,
            res_code="RES-001",
            platform="airbnb",
            check_in=date(2025, 6, 1),
            check_out=date(2025, 6, 5),
            gross_booking=Decimal("500.00"),
        )
        db.add(res)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)
        assert len(result.checklist) >= 1
        airbnb_items = [c for c in result.checklist if c.expected_type == "1099_k" and c.expected_from == "Airbnb"]
        assert len(airbnb_items) == 1
        assert airbnb_items[0].status == "missing"

    @pytest.mark.asyncio
    async def test_checklist_marks_received_when_document_exists(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        # Create reservation that expects a 1099-K
        res = Reservation(
            id=uuid.uuid4(),
            organization_id=org.id,
            res_code="RES-002",
            platform="airbnb",
            check_in=date(2025, 7, 1),
            check_out=date(2025, 7, 3),
            gross_booking=Decimal("300.00"),
        )
        db.add(res)
        await db.flush()

        # Create a document with matching form instance
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name="1099-K-Airbnb.pdf",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="1099_k",
            source_type="extracted",
            document_id=doc.id,
            issuer_name="Airbnb",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="gross_amount",
            field_label="Gross amount",
            value_numeric=Decimal("15000.00"),
        )
        db.add(field)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)

        # Should have the document
        assert len(result.documents) == 1
        assert result.documents[0].issuer_name == "Airbnb"

        # Checklist should show received
        airbnb_items = [c for c in result.checklist if c.expected_type == "1099_k"]
        assert len(airbnb_items) == 1
        assert airbnb_items[0].status == "received"
        assert airbnb_items[0].document_id == doc.id

    @pytest.mark.asyncio
    async def test_checklist_detects_missing_1098_from_mortgage_transactions(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="6738 Peerless Ave",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.flush()

        txn = Transaction(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            property_id=prop.id,
            transaction_date=date(2025, 3, 1),
            tax_year=2025,
            vendor="Wells Fargo",
            amount=Decimal("1200.00"),
            transaction_type="expense",
            category="mortgage_interest",
            status="approved",
        )
        db.add(txn)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)
        mortgage_items = [c for c in result.checklist if c.expected_type == "1098"]
        assert len(mortgage_items) == 1
        assert mortgage_items[0].status == "missing"
        assert "6738 Peerless" in mortgage_items[0].reason

    @pytest.mark.asyncio
    async def test_checklist_detects_missing_1099misc_from_management_fees(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        txn = Transaction(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            transaction_date=date(2025, 1, 15),
            tax_year=2025,
            vendor="Vello LLC",
            amount=Decimal("3500.00"),
            transaction_type="expense",
            category="management_fee",
            status="approved",
        )
        db.add(txn)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)
        mgmt_items = [c for c in result.checklist if c.expected_type == "1099_misc"]
        assert len(mgmt_items) == 1
        assert mgmt_items[0].status == "missing"
        assert mgmt_items[0].expected_from == "Vello LLC"
