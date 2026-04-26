"""Tests for the document checklist service."""
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
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.tax import document_checklist_service


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="checklist-owner@example.com",
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
    o = await organization_repo.create(db, "Checklist Test Org", owner.id)
    await db.commit()
    await db.refresh(o)
    return o


@pytest.fixture(autouse=True)
def _patch_sessions(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with patch(
        "app.services.tax.document_checklist_service.AsyncSessionLocal",
        _fake_session,
    ):
        yield


def _make_ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role="owner",
    )


# ---------------------------------------------------------------------------
# HTTP client fixture
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Service unit tests
# ---------------------------------------------------------------------------


class TestDocumentChecklistService:
    @pytest.mark.asyncio
    async def test_raises_for_missing_return(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        with pytest.raises(LookupError, match="not found"):
            await document_checklist_service.get_checklist(org.id, uuid.uuid4())

    @pytest.mark.asyncio
    async def test_empty_return_no_properties(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        assert result.tax_year == 2025
        assert result.items == []
        assert result.received_count == 0
        assert result.total_count == 0

    @pytest.mark.asyncio
    async def test_property_generates_insurance_item(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="100 Main St",
            type=PropertyType.SHORT_TERM,
            is_active=True,
        )
        db.add(prop)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        insurance_items = [i for i in result.items if i.category == "property_insurance"]
        assert len(insurance_items) == 1
        assert insurance_items[0].status == "missing"
        assert "100 Main St" in insurance_items[0].description
        assert insurance_items[0].property_name == "100 Main St"
        assert insurance_items[0].document_ids == []

    @pytest.mark.asyncio
    async def test_insurance_received_when_document_exists(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="200 Oak Ave",
            type=PropertyType.LONG_TERM,
            is_active=True,
        )
        db.add(prop)
        await db.flush()

        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            property_id=prop.id,
            file_name="insurance_policy_2025.pdf",
            document_type="insurance_policy",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        insurance_items = [i for i in result.items if i.category == "property_insurance"]
        assert len(insurance_items) == 1
        assert insurance_items[0].status == "received"
        assert doc.id in insurance_items[0].document_ids

    @pytest.mark.asyncio
    async def test_mortgage_1098_missing_when_no_instance(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="6738 Peerless St",
            type=PropertyType.SHORT_TERM,
            is_active=True,
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

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        mortgage_items = [i for i in result.items if i.category == "mortgage_1098"]
        assert len(mortgage_items) == 1
        assert mortgage_items[0].status == "missing"
        assert "6738 Peerless St" in mortgage_items[0].description

    @pytest.mark.asyncio
    async def test_mortgage_1098_received_when_instance_exists(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="300 Elm Dr",
            type=PropertyType.LONG_TERM,
            is_active=True,
        )
        db.add(prop)
        await db.flush()

        txn = Transaction(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            property_id=prop.id,
            transaction_date=date(2025, 1, 1),
            tax_year=2025,
            vendor="Bank of America",
            amount=Decimal("800.00"),
            transaction_type="expense",
            category="mortgage_interest",
            status="approved",
        )
        db.add(txn)
        await db.flush()

        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            property_id=prop.id,
            file_name="1098_2025.pdf",
            document_type="1098",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="1098",
            source_type="extracted",
            document_id=doc.id,
            property_id=prop.id,
            issuer_name="Bank of America",
        )
        db.add(inst)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        mortgage_items = [i for i in result.items if i.category == "mortgage_1098"]
        assert len(mortgage_items) == 1
        assert mortgage_items[0].status == "received"
        assert doc.id in mortgage_items[0].document_ids

    @pytest.mark.asyncio
    async def test_w2_item_from_extracted_instance(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name="w2_acme_2025.pdf",
            document_type="w2",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="w2",
            source_type="extracted",
            document_id=doc.id,
            issuer_name="Acme Corp",
        )
        db.add(inst)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        w2_items = [i for i in result.items if i.category == "w2"]
        assert len(w2_items) == 1
        assert w2_items[0].status == "received"
        assert w2_items[0].expected_vendor == "Acme Corp"
        assert "Acme Corp" in w2_items[0].description
        assert doc.id in w2_items[0].document_ids

    @pytest.mark.asyncio
    async def test_1099_int_item_from_extracted_instance(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name="1099int_chase.pdf",
            document_type="1099_int",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="1099_int",
            source_type="extracted",
            document_id=doc.id,
            issuer_name="Chase Bank",
        )
        db.add(inst)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        int_items = [i for i in result.items if i.category == "1099_int"]
        assert len(int_items) == 1
        assert int_items[0].status == "received"
        assert "Chase Bank" in int_items[0].description
        assert doc.id in int_items[0].document_ids

    @pytest.mark.asyncio
    async def test_received_count_and_total_count(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        """received_count and total_count are derived correctly."""
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="400 Pine Rd",
            type=PropertyType.SHORT_TERM,
            is_active=True,
        )
        db.add(prop)
        await db.flush()

        # Insurance received
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            property_id=prop.id,
            file_name="insurance_policy.pdf",
            document_type="insurance_policy",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        # One property -> one insurance item (received), no mortgage/tax txns
        assert result.total_count == 1
        assert result.received_count == 1

    @pytest.mark.asyncio
    async def test_deduplicates_same_issuer_w2(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        """Two W-2 instances from same employer produce only one checklist item."""
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        for i in range(2):
            doc = Document(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=owner.id,
                file_name=f"w2_{i}.pdf",
                document_type="w2",
                source="upload",
                status="completed",
            )
            db.add(doc)
            await db.flush()

            inst = TaxFormInstance(
                id=uuid.uuid4(),
                tax_return_id=tr.id,
                form_name="w2",
                source_type="extracted",
                document_id=doc.id,
                issuer_name="BigCo Inc",
            )
            db.add(inst)

        await db.commit()

        result = await document_checklist_service.get_checklist(org.id, tr.id)
        w2_items = [i for i in result.items if i.category == "w2"]
        assert len(w2_items) == 1


# ---------------------------------------------------------------------------
# Route tests
# ---------------------------------------------------------------------------


class TestDocumentChecklistRoute:
    @pytest.mark.asyncio
    async def test_returns_404_for_missing_return(self, client: AsyncClient) -> None:
        resp = await client.get(f"/tax-returns/{uuid.uuid4()}/document-checklist")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_checklist_schema(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}/document-checklist")
        assert resp.status_code == 200
        data = resp.json()
        assert "tax_year" in data
        assert "items" in data
        assert "received_count" in data
        assert "total_count" in data
        assert data["tax_year"] == 2025
        assert isinstance(data["items"], list)

    @pytest.mark.asyncio
    async def test_checklist_item_shape(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            name="500 Birch Ln",
            type=PropertyType.SHORT_TERM,
            is_active=True,
        )
        db.add(prop)
        await db.commit()

        resp = await client.get(f"/tax-returns/{tr.id}/document-checklist")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) >= 1

        item = data["items"][0]
        assert "category" in item
        assert "description" in item
        assert "status" in item
        assert "document_ids" in item
        assert isinstance(item["document_ids"], list)
        assert item["status"] in ("received", "missing")
