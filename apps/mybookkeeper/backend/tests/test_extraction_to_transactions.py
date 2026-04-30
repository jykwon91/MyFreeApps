"""End-to-end tests: upload file -> extraction -> transaction created.

Tests the full pipeline through process_document(), mocking Claude extraction
and AsyncSessionLocal to use the test SQLite session.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.transaction import Transaction
from app.models.user.user import User


async def _setup_org_and_user(db: AsyncSession) -> tuple[User, uuid.UUID]:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return user, org.id


def _make_document(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    status: str = "processing",
    file_type: str = "pdf",
    property_id: uuid.UUID | None = None,
) -> Document:
    return Document(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        status=status,
        file_name="test.pdf",
        file_type=file_type,
        file_content=b"fake-pdf-content",
        file_mime_type="application/pdf",
        source="upload",
    )


def _single_invoice_extraction() -> dict:
    """Claude extraction response for a single invoice."""
    return {
        "data": [
            {
                "vendor": "ABC Plumbing",
                "date": "2025-06-15",
                "amount": "250.00",
                "description": "Pipe repair",
                "tags": ["maintenance"],
                "tax_relevant": True,
                "confidence": "high",
                "document_type": "invoice",
                "address": "123 Main St",
                "channel": None,
                "line_items": None,
            }
        ],
        "tokens": 500,
    }


def _pm_statement_extraction() -> dict:
    """Claude extraction response for a PM statement with multiple line items."""
    return {
        "data": [
            {
                "vendor": "Vacasa",
                "date": "2025-07-01",
                "amount": "2500.00",
                "description": "July statement",
                "tags": ["rental_revenue"],
                "tax_relevant": True,
                "confidence": "high",
                "document_type": "statement",
                "address": "123 Main St",
                "channel": "airbnb",
                "line_items": [
                    {
                        "res_code": "RES001",
                        "check_in": "2025-06-01",
                        "check_out": "2025-06-05",
                        "channel": "airbnb",
                        "gross_booking": "800.00",
                        "net_client_earnings": "650.00",
                        "guest_name": "Alice Smith",
                    },
                    {
                        "res_code": "RES002",
                        "check_in": "2025-06-10",
                        "check_out": "2025-06-15",
                        "channel": "airbnb",
                        "gross_booking": "1000.00",
                        "net_client_earnings": "850.00",
                        "guest_name": "Bob Jones",
                    },
                ],
            },
            {
                "vendor": "Vacasa",
                "date": "2025-07-01",
                "amount": "150.00",
                "description": "Management fee",
                "tags": ["management_fee"],
                "tax_relevant": True,
                "confidence": "high",
                "document_type": "statement",
                "address": "123 Main St",
                "channel": None,
                "line_items": None,
            },
        ],
        "tokens": 800,
    }


def _year_end_extraction() -> dict:
    """Claude extraction response for a year-end statement."""
    return {
        "document_type": "year_end_statement",
        "reservations": [
            {
                "res_code": "YE001",
                "billing_period": "2025-01",
                "check_in": "2025-01-05",
                "check_out": "2025-01-10",
                "channel": "airbnb",
                "gross_booking": "500.00",
                "net_client_earnings": "400.00",
                "guest_name": "Charlie Brown",
            },
            {
                "res_code": "YE002",
                "billing_period": "2025-02",
                "check_in": "2025-02-15",
                "check_out": "2025-02-20",
                "channel": "vrbo",
                "gross_booking": "600.00",
                "net_client_earnings": "480.00",
                "guest_name": "Diana Prince",
            },
        ],
        "tokens": 600,
    }


def _failed_extraction() -> dict:
    """Claude extraction response with no useful data."""
    return {
        "data": [
            {
                "vendor": None,
                "date": None,
                "amount": None,
                "description": None,
                "tags": [],
                "tax_relevant": False,
                "confidence": "low",
                "document_type": "other",
            }
        ],
        "tokens": 100,
    }


def _mock_session_factory(db: AsyncSession):
    """Create a context manager mock that yields the test session for both
    AsyncSessionLocal and unit_of_work."""

    class FakeSession:
        def __init__(self) -> None:
            self._session = db

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, *args):
            pass

    class FakeUnitOfWork:
        async def __aenter__(self):
            return db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            if exc_type is None:
                await db.flush()

    return FakeSession, FakeUnitOfWork


class TestSingleInvoiceUpload:

    @pytest.mark.asyncio
    async def test_produces_one_transaction_with_correct_fields(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = Property(
            id=uuid.uuid4(), user_id=user.id, organization_id=org_id,
            name="123 Main", address="123 Main St",
        )
        db.add(prop)
        doc = _make_document(org_id, user.id, property_id=prop.id)
        db.add(doc)
        await db.commit()

        extraction = _single_invoice_extraction()
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Invoice text here with enough content to pass the 50 char check easily."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.resolve_property_id", new_callable=AsyncMock, return_value=prop.id),
            patch("app.services.extraction.document_extraction_service.evaluate_dedup", new_callable=AsyncMock) as mock_dedup,
        ):
            from app.services.extraction.dedup_service import DedupDecision
            mock_dedup.return_value = DedupDecision(action="create", reason="No match")

            from app.services.extraction.document_extraction_service import process_document
            result = await process_document(doc.id)

        assert len(result.created) == 1

        # Verify Extraction was created
        ext_rows = (await db.execute(select(Extraction).where(Extraction.document_id == doc.id))).scalars().all()
        assert len(ext_rows) == 1
        assert ext_rows[0].status == "completed"
        assert ext_rows[0].confidence == "high"
        assert ext_rows[0].document_type == "invoice"

        # Verify Transaction was created
        txn_rows = (await db.execute(select(Transaction).where(Transaction.organization_id == org_id))).scalars().all()
        assert len(txn_rows) == 1
        txn = txn_rows[0]
        assert txn.vendor == "ABC Plumbing"
        assert txn.amount == Decimal("250.00")
        assert txn.transaction_type == "expense"
        assert txn.category == "maintenance"
        assert txn.tax_relevant is True
        assert txn.tax_year == 2025
        assert txn.schedule_e_line == "line_7_cleaning_maintenance"
        assert txn.property_id == prop.id
        assert txn.organization_id == org_id
        assert txn.user_id == user.id
        assert txn.extraction_id == ext_rows[0].id
        assert txn.status == "approved"


class TestPMStatementUpload:

    @pytest.mark.asyncio
    async def test_produces_multiple_transactions_and_reservations(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = Property(
            id=uuid.uuid4(), user_id=user.id, organization_id=org_id,
            name="123 Main", address="123 Main St",
        )
        db.add(prop)
        doc = _make_document(org_id, user.id, property_id=prop.id)
        db.add(doc)
        await db.commit()

        extraction = _pm_statement_extraction()
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Statement text here with enough content to pass the 50 char check easily."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.resolve_property_id", new_callable=AsyncMock, return_value=prop.id),
            patch("app.services.extraction.document_extraction_service.evaluate_dedup", new_callable=AsyncMock) as mock_dedup,
        ):
            from app.services.extraction.dedup_service import DedupDecision
            mock_dedup.return_value = DedupDecision(action="create", reason="No match")

            from app.services.extraction.document_extraction_service import process_document
            result = await process_document(doc.id)

        # Two items from extraction -> 2 created docs (first reuses upload doc, second is new)
        assert len(result.created) == 2

        # Verify Transactions
        txn_rows = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
            .order_by(Transaction.amount.desc())
        )).scalars().all()
        assert len(txn_rows) == 2

        revenue_txn = next(t for t in txn_rows if t.category == "rental_revenue")
        assert revenue_txn.amount == Decimal("2500.00")
        assert revenue_txn.transaction_type == "income"
        assert revenue_txn.schedule_e_line == "line_3_rents_received"

        fee_txn = next(t for t in txn_rows if t.category == "management_fee")
        assert fee_txn.amount == Decimal("150.00")
        assert fee_txn.transaction_type == "expense"
        assert fee_txn.schedule_e_line == "line_8_commissions"

        # Verify Reservations were created from line_items of the revenue transaction
        res_rows = (await db.execute(
            select(BookingStatement).where(BookingStatement.organization_id == org_id)
            .order_by(BookingStatement.res_code.asc())
        )).scalars().all()
        assert len(res_rows) == 2
        assert res_rows[0].res_code == "RES001"
        assert res_rows[0].guest_name == "Alice Smith"
        assert res_rows[0].gross_booking == Decimal("800.00")
        assert res_rows[0].net_client_earnings == Decimal("650.00")
        assert res_rows[0].transaction_id == revenue_txn.id
        assert res_rows[1].res_code == "RES002"
        assert res_rows[1].guest_name == "Bob Jones"


class TestYearEndStatement:

    @pytest.mark.asyncio
    async def test_creates_reconciliation_source_and_reservations(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = _make_document(org_id, user.id)
        db.add(doc)
        await db.commit()

        extraction = _year_end_extraction()
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Year end statement text with enough content to pass the 50 char check."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.extract_from_image", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.transactions.reconciliation_service.booking_statement_repo.find_by_res_code", new_callable=AsyncMock, return_value=None),
        ):
            from app.services.extraction.document_extraction_service import process_document
            result = await process_document(doc.id)

        assert result.reconciliation is not None
        assert len(result.reconciliation) == 2

        # Reservations are created during reconciliation and self-match
        for item in result.reconciliation:
            assert item.status == "matched"

        # Verify ReconciliationSource was created
        rs_rows = (await db.execute(
            select(ReconciliationSource).where(ReconciliationSource.organization_id == org_id)
        )).scalars().all()
        assert len(rs_rows) == 1
        rs = rs_rows[0]
        assert rs.source_type == "year_end_statement"
        assert rs.tax_year == 2025
        assert rs.reported_amount == Decimal("400.00") + Decimal("480.00")  # sum of net_client_earnings

        # Verify Reservation rows were created
        res_rows = (await db.execute(
            select(BookingStatement).where(BookingStatement.organization_id == org_id)
            .order_by(BookingStatement.res_code.asc())
        )).scalars().all()
        assert len(res_rows) == 2
        assert res_rows[0].res_code == "YE001"
        assert res_rows[0].check_in == date(2025, 1, 5)
        assert res_rows[0].check_out == date(2025, 1, 10)
        assert res_rows[0].platform == "airbnb"
        assert res_rows[1].res_code == "YE002"
        assert res_rows[1].platform == "vrbo"

        await db.refresh(doc)
        assert doc.status == "completed"


class TestDuplicateDetection:

    @pytest.mark.asyncio
    async def test_duplicate_skips_transaction_creation(self, db: AsyncSession) -> None:
        """When an exact duplicate is found (amounts and properties match),
        the upload doc is marked duplicate and no new transaction is created."""
        user, org_id = await _setup_org_and_user(db)
        prop = Property(
            id=uuid.uuid4(), user_id=user.id, organization_id=org_id,
            name="123 Main", address="123 Main St",
        )
        db.add(prop)

        # Create existing transaction that will be the "duplicate"
        existing_txn = Transaction(
            id=uuid.uuid4(),
            organization_id=org_id,
            user_id=user.id,
            property_id=prop.id,
            vendor="ABC Plumbing",
            transaction_date=date(2025, 6, 15),
            tax_year=2025,
            amount=Decimal("250.00"),
            transaction_type="expense",
            category="maintenance",
            status="approved",
            tags=["maintenance"],
            tax_relevant=True,
        )
        db.add(existing_txn)

        doc = _make_document(org_id, user.id, property_id=prop.id)
        db.add(doc)
        await db.commit()

        extraction = _single_invoice_extraction()
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Invoice text here with enough content to pass the 50 char check easily."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.resolve_property_id", new_callable=AsyncMock, return_value=prop.id),
            patch("app.services.extraction.document_extraction_service.evaluate_dedup", new_callable=AsyncMock) as mock_dedup,
        ):
            from app.services.extraction.dedup_service import DedupDecision
            mock_dedup.return_value = DedupDecision(
                action="skip",
                existing_transaction=existing_txn,
                reason="Exact vendor+date match",
                confidence="high",
            )

            from app.services.extraction.document_extraction_service import process_document
            result = await process_document(doc.id)

        assert len(result.created) == 0
        assert result.skipped == 1

        # Only the pre-existing transaction should exist (no new one created)
        txn_rows = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalars().all()
        assert len(txn_rows) == 1
        assert txn_rows[0].id == existing_txn.id

        # Extraction was still recorded
        ext_rows = (await db.execute(
            select(Extraction).where(Extraction.document_id == doc.id)
        )).scalars().all()
        assert len(ext_rows) == 1


class TestFailedExtraction:

    @pytest.mark.asyncio
    async def test_failed_extraction_creates_extraction_no_transaction(self, db: AsyncSession) -> None:
        """When extraction returns no useful data, extraction is created but no transaction."""
        user, org_id = await _setup_org_and_user(db)
        doc = _make_document(org_id, user.id)
        db.add(doc)
        await db.commit()

        extraction = _failed_extraction()
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Some extracted text that is longer than fifty characters for the check."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.extract_from_image", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.resolve_property_id", new_callable=AsyncMock, return_value=None),
            patch("app.services.extraction.document_extraction_service.evaluate_dedup", new_callable=AsyncMock) as mock_dedup,
        ):
            from app.services.extraction.dedup_service import DedupDecision
            mock_dedup.return_value = DedupDecision(action="create", reason="No match")

            from app.services.extraction.document_extraction_service import process_document
            result = await process_document(doc.id)

        # Extraction was created
        ext_rows = (await db.execute(
            select(Extraction).where(Extraction.document_id == doc.id)
        )).scalars().all()
        assert len(ext_rows) == 1
        assert ext_rows[0].status == "completed"

        # No transaction created (amount is None)
        txn_rows = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalars().all()
        assert len(txn_rows) == 0

        await db.refresh(doc)
        assert doc.status == "completed"

    @pytest.mark.asyncio
    async def test_unsupported_file_type_marks_document_failed(self, db: AsyncSession) -> None:
        """Unsupported file type raises ValueError, document marked failed."""
        user, org_id = await _setup_org_and_user(db)
        doc = _make_document(org_id, user.id, file_type="unknown")
        db.add(doc)
        await db.commit()

        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
        ):
            from app.services.extraction.document_extraction_service import process_document
            with pytest.raises(ValueError, match="Unsupported file type"):
                await process_document(doc.id)

        await db.refresh(doc)
        assert doc.status == "failed"


class TestExtractionFields:

    @pytest.mark.asyncio
    async def test_extraction_stores_tokens_and_raw_response(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = Property(
            id=uuid.uuid4(), user_id=user.id, organization_id=org_id,
            name="123 Main", address="123 Main St",
        )
        db.add(prop)
        doc = _make_document(org_id, user.id, property_id=prop.id)
        db.add(doc)
        await db.commit()

        extraction = _single_invoice_extraction()
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Invoice text here with enough content to pass the 50 char check easily."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.resolve_property_id", new_callable=AsyncMock, return_value=prop.id),
            patch("app.services.extraction.document_extraction_service.evaluate_dedup", new_callable=AsyncMock) as mock_dedup,
        ):
            from app.services.extraction.dedup_service import DedupDecision
            mock_dedup.return_value = DedupDecision(action="create", reason="No match")

            from app.services.extraction.document_extraction_service import process_document
            await process_document(doc.id)

        ext_rows = (await db.execute(
            select(Extraction).where(Extraction.document_id == doc.id)
        )).scalars().all()
        assert len(ext_rows) == 1
        ext = ext_rows[0]
        assert ext.tokens_used == 500
        assert ext.raw_response == extraction
        assert ext.organization_id == org_id
        assert ext.user_id == user.id

    @pytest.mark.asyncio
    async def test_income_transaction_from_revenue_tag(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = Property(
            id=uuid.uuid4(), user_id=user.id, organization_id=org_id,
            name="Beach House", address="456 Beach Rd",
        )
        db.add(prop)
        doc = _make_document(org_id, user.id, property_id=prop.id)
        db.add(doc)
        await db.commit()

        extraction = {
            "data": [
                {
                    "vendor": "Airbnb",
                    "date": "2025-08-01",
                    "amount": "1200.00",
                    "description": "August payout",
                    "tags": ["rental_revenue"],
                    "tax_relevant": True,
                    "confidence": "high",
                    "document_type": "statement",
                    "address": "456 Beach Rd",
                    "channel": "airbnb",
                    "line_items": None,
                }
            ],
            "tokens": 300,
        }
        FakeSession, FakeUnitOfWork = _mock_session_factory(db)

        with (
            patch("app.services.extraction.document_extraction_service.AsyncSessionLocal", FakeSession),
            patch("app.services.extraction.document_extraction_service.unit_of_work", FakeUnitOfWork),
            patch("app.services.extraction.document_extraction_service.extract_text_from_pdf", new_callable=AsyncMock, return_value="Payout statement text that is longer than fifty characters for the check."),
            patch("app.services.extraction.document_extraction_service.extract_from_text", new_callable=AsyncMock, return_value=extraction),
            patch("app.services.extraction.document_extraction_service.resolve_property_id", new_callable=AsyncMock, return_value=prop.id),
            patch("app.services.extraction.document_extraction_service.evaluate_dedup", new_callable=AsyncMock) as mock_dedup,
        ):
            from app.services.extraction.dedup_service import DedupDecision
            mock_dedup.return_value = DedupDecision(action="create", reason="No match")

            from app.services.extraction.document_extraction_service import process_document
            await process_document(doc.id)

        txn_rows = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalars().all()
        assert len(txn_rows) == 1
        txn = txn_rows[0]
        assert txn.transaction_type == "income"
        assert txn.category == "rental_revenue"
        assert txn.amount == Decimal("1200.00")
        assert txn.schedule_e_line == "line_3_rents_received"
        assert txn.channel == "airbnb"
