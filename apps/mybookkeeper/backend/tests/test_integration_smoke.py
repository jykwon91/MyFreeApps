"""Integration smoke tests — verify core user flows work end-to-end.

These tests hit the actual service/repo layers with a real DB session
(SQLite in-memory) to catch issues that unit tests with mocks miss:
- Column mismatches between models and services
- Missing fields in Document/Transaction creation
- Schema serialization errors
- Route handler → service → repo round-trips
"""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import document_repo, transaction_repo
from app.schemas.documents.document import DocumentRead
from app.schemas.transactions.transaction import TransactionRead


@pytest.fixture()
async def ctx(db: AsyncSession, test_user: User, test_org: Organization) -> RequestContext:
    return RequestContext(
        organization_id=test_org.id,
        user_id=test_user.id,
        org_role=OrgRole.OWNER,
    )


class TestDocumentUploadSmoke:
    """Verify document upload creates a valid Document row."""

    @pytest.mark.asyncio
    async def test_accept_upload_creates_document(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.documents.document_upload_service.unit_of_work", _fake):
            from app.services.documents.document_upload_service import accept_upload
            result = await accept_upload(
                ctx, b"%PDF-1.4 fake content", "invoice.pdf", "application/pdf",
            )

        assert result["document_id"] is not None
        assert result["batch_total"] == 1

        doc = await document_repo.get_by_id(db, uuid.UUID(result["document_id"]), ctx.organization_id)
        assert doc is not None
        assert doc.file_name == "invoice.pdf"
        assert doc.status == "processing"
        assert doc.organization_id == ctx.organization_id
        assert doc.user_id == ctx.user_id

    @pytest.mark.asyncio
    async def test_document_serializes_to_schema(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        doc = Document(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            file_name="test.pdf",
            file_type="pdf",
            file_mime_type="application/pdf",
            source="upload",
            status="processing",
        )
        db.add(doc)
        await db.flush()

        read = DocumentRead.model_validate(doc, from_attributes=True)
        assert read.file_name == "test.pdf"
        assert read.status == "processing"


class TestTransactionCRUDSmoke:
    """Verify transaction CRUD operations work end-to-end."""

    @pytest.mark.asyncio
    async def test_create_manual_transaction(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            from app.services.transactions.transaction_service import create_manual_transaction
            from app.schemas.transactions.transaction import TransactionCreate

            data = TransactionCreate(
                transaction_date=datetime(2025, 6, 15, tzinfo=timezone.utc).date(),
                vendor="Test Plumber",
                amount=Decimal("150.00"),
                transaction_type="expense",
                category="maintenance",
                tax_relevant=True,
            )
            txn = await create_manual_transaction(ctx, data.model_dump())

        assert txn is not None
        assert txn.vendor == "Test Plumber"
        assert txn.amount == Decimal("150.00")
        assert txn.is_manual is True
        assert txn.organization_id == ctx.organization_id
        assert txn.tax_year == 2025

    @pytest.mark.asyncio
    async def test_transaction_serializes_to_schema(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        txn = Transaction(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            transaction_date=datetime(2025, 6, 15).date(),
            tax_year=2025,
            vendor="Test",
            amount=Decimal("100.00"),
            transaction_type="expense",
            category="maintenance",
            status="pending",
        )
        db.add(txn)
        await db.flush()

        read = TransactionRead.model_validate(txn, from_attributes=True)
        assert read.vendor == "Test"
        assert read.amount == Decimal("100.00")

    @pytest.mark.asyncio
    async def test_list_transactions_returns_results(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        txn = Transaction(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            transaction_date=datetime(2025, 6, 15).date(),
            tax_year=2025,
            vendor="Listed Vendor",
            amount=Decimal("200.00"),
            transaction_type="expense",
            category="utilities",
            status="pending",
        )
        db.add(txn)
        await db.commit()

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=db)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from app.services.transactions.transaction_service import list_transactions
            results = await list_transactions(ctx)

        assert len(results) >= 1
        assert any(t.vendor == "Listed Vendor" for t in results)

    @pytest.mark.asyncio
    async def test_bulk_approve_requires_property(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        txn_no_prop = Transaction(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            transaction_date=datetime(2025, 6, 15).date(),
            tax_year=2025,
            vendor="No Prop",
            amount=Decimal("100.00"),
            transaction_type="expense",
            category="maintenance",
            status="pending",
        )
        db.add(txn_no_prop)
        await db.commit()

        approved = await transaction_repo.bulk_approve(db, [txn_no_prop.id], ctx.organization_id)
        assert approved == 0  # no property → not approved


class TestExtractionSmoke:
    """Verify extraction records can be created and linked."""

    @pytest.mark.asyncio
    async def test_extraction_links_to_document(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        doc = Document(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            file_name="receipt.pdf",
            file_type="pdf",
            source="upload",
            status="processing",
        )
        db.add(doc)
        await db.flush()

        ext = Extraction(
            document_id=doc.id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            status="completed",
            document_type="invoice",
            tokens_used=500,
        )
        db.add(ext)
        await db.flush()

        from app.repositories import extraction_repo
        latest = await extraction_repo.get_latest_by_document(db, doc.id)
        assert latest is not None
        assert latest.id == ext.id
        assert latest.document_id == doc.id

    @pytest.mark.asyncio
    async def test_transaction_links_to_extraction(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        doc = Document(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            file_name="inv.pdf",
            file_type="pdf",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        ext = Extraction(
            document_id=doc.id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            status="completed",
            document_type="invoice",
            tokens_used=100,
        )
        db.add(ext)
        await db.flush()

        txn = Transaction(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            extraction_id=ext.id,
            transaction_date=datetime(2025, 6, 15).date(),
            tax_year=2025,
            vendor="Linked Vendor",
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="maintenance",
            status="pending",
        )
        db.add(txn)
        await db.flush()

        fetched = await transaction_repo.get_by_id(db, txn.id, ctx.organization_id)
        assert fetched is not None
        assert fetched.extraction_id == ext.id


class TestReconciliationSmoke:
    """Verify reconciliation source creation works."""

    @pytest.mark.asyncio
    async def test_create_reconciliation_source(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        from app.models.transactions.reconciliation_source import ReconciliationSource
        from app.repositories import reconciliation_repo

        source = ReconciliationSource(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            source_type="1099_k",
            tax_year=2025,
            issuer="Airbnb",
            reported_amount=Decimal("42000.00"),
        )
        created = await reconciliation_repo.create_source(db, source)
        await db.flush()

        assert created.id is not None
        assert created.matched_amount == Decimal("0.00")
        assert created.status == "unmatched"


class TestRouteSchemaSmoke:
    """Verify route handlers return valid responses (not 500s)."""

    @pytest.mark.asyncio
    async def test_documents_list_returns_200(self) -> None:
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.permissions import current_org_member

        fake_ctx = RequestContext(
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        app.dependency_overrides[current_org_member] = lambda: fake_ctx

        with patch("app.services.documents.document_query_service.AsyncSessionLocal") as mock_cls:
            mock_db = AsyncMock()
            mock_db.execute = AsyncMock(return_value=AsyncMock(scalars=lambda: AsyncMock(all=lambda: [])))
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from app.services.documents import document_query_service
            with patch.object(document_query_service, "list_documents", return_value=[]):
                client = TestClient(app)
                response = client.get("/documents")

        assert response.status_code == 200
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_transactions_list_returns_200(self) -> None:
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.permissions import current_org_member

        fake_ctx = RequestContext(
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        app.dependency_overrides[current_org_member] = lambda: fake_ctx

        from app.services.transactions import transaction_service
        with patch.object(transaction_service, "list_transactions", return_value=[]):
            client = TestClient(app)
            response = client.get("/transactions")

        assert response.status_code == 200
        app.dependency_overrides.clear()


class TestTaxDocumentExtraction:
    """Verify 1099/tax form extraction creates correct transaction type and tax form."""

    @pytest.mark.asyncio
    async def test_1099_misc_creates_income_transaction(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        """A 1099-MISC should create an income transaction, not expense."""
        from app.mappers.transaction_mapper import build_transaction_from_mapped_item
        from app.mappers.extraction_mapper import MappedItem

        item = MappedItem(
            vendor="Vello LLC",
            date=datetime(2025, 12, 31, tzinfo=timezone.utc),
            amount=Decimal("45724.88"),
            description="1099-MISC rents",
            tags=["uncategorized"],
            tax_relevant=True,
            channel=None,
            address="6738 Peerless St",
            document_type="tax_form",
            line_items=None,
            confidence="high",
            property_id=None,
            status="pending",
            review_fields=[],
            review_reason=None,
            raw_data={"document_type": "tax_form", "category": "uncategorized"},
        )
        txn = build_transaction_from_mapped_item(item, ctx.organization_id, ctx.user_id, uuid.uuid4())
        assert txn is not None
        assert txn.transaction_type == "income", f"1099 should be income, got {txn.transaction_type}"
        assert txn.category == "rental_revenue", f"1099 rents should be rental_revenue, got {txn.category}"

    @pytest.mark.asyncio
    async def test_normalize_tax_doc_type(self) -> None:
        """Claude returns varied form_type strings that need normalization."""
        from app.mappers.tax_form_mapper import normalize_tax_doc_type

        assert normalize_tax_doc_type({"form_type": "1099-MISC"}) == "1099_misc"
        assert normalize_tax_doc_type({"form_type": "W-2"}) == "w2"
        assert normalize_tax_doc_type({"form_type": "1099-K"}) == "1099_k"
        assert normalize_tax_doc_type({"document_type": "invoice"}) == "invoice"

    @pytest.mark.asyncio
    async def testbuild_tax_form_data_from_reported_amounts(self) -> None:
        """Claude returns reported_amounts instead of tax_form_data.fields."""
        from app.mappers.tax_form_mapper import build_tax_form_data

        doc_data = {
            "payer": "Vello LLC",
            "tax_year": "2025",
            "reported_amounts": {
                "box_1_rents": "45724.88",
                "box_2_royalties": None,
            },
        }
        result = build_tax_form_data(doc_data)
        assert result is not None
        assert result["tax_year"] == 2025
        assert result["issuer_name"] == "Vello LLC"
        assert result["fields"]["box_1"] == "45724.88"
        assert "box_2_royalties" not in result["fields"]  # null values stripped
