"""Tests for the export service — CSV and PDF generation."""
import csv
import io
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.transactions import export_service
from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole


async def _setup(db: AsyncSession) -> tuple[User, uuid.UUID, Property]:
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
    await db.flush()
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Beach House",
        address="123 Ocean Blvd",
    )
    db.add(prop)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    await db.refresh(prop)
    return user, org.id, prop


def _make_txn(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    prop_id: uuid.UUID,
    *,
    amount: Decimal = Decimal("100.00"),
    category: str = "maintenance",
    transaction_type: str = "expense",
    vendor: str = "Plumber Inc",
    status: str = "approved",
    tax_relevant: bool = True,
    schedule_e_line: str | None = "line_7_cleaning_maintenance",
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=prop_id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        vendor=vendor,
        description="Test transaction",
        amount=amount,
        transaction_type=transaction_type,
        category=category,
        tags=[category],
        tax_relevant=tax_relevant,
        schedule_e_line=schedule_e_line,
        status=status,
        payment_method="check",
    )


class TestExportCSV:
    @pytest.mark.asyncio
    async def test_csv_has_correct_headers(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)
        db.add(_make_txn(org_id, user.id, prop.id))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            csv_bytes = await export_service.export_transactions_csv(ctx)

        reader = csv.reader(io.StringIO(csv_bytes.decode("utf-8")))
        headers = next(reader)
        assert headers == export_service.CSV_HEADERS

    @pytest.mark.asyncio
    async def test_csv_contains_transaction_data(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)
        db.add(_make_txn(org_id, user.id, prop.id, vendor="Test Vendor Co", amount=Decimal("250.50")))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            csv_bytes = await export_service.export_transactions_csv(ctx)

        reader = csv.reader(io.StringIO(csv_bytes.decode("utf-8")))
        next(reader)  # skip headers
        row = next(reader)
        assert row[0] == "2025-06-15"
        assert row[1] == "Test Vendor Co"
        assert row[3] == "250.50"
        assert row[4] == "expense"

    @pytest.mark.asyncio
    async def test_csv_empty_when_no_transactions(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            csv_bytes = await export_service.export_transactions_csv(ctx)

        lines = csv_bytes.decode("utf-8").strip().splitlines()
        assert len(lines) == 1  # headers only


class TestExportPDF:
    @pytest.mark.asyncio
    async def test_pdf_starts_with_magic_bytes(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)
        db.add(_make_txn(org_id, user.id, prop.id))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            pdf_bytes = await export_service.export_transactions_pdf(ctx)

        assert pdf_bytes[:5] == b"%PDF-"

    @pytest.mark.asyncio
    async def test_pdf_not_empty_with_transactions(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)
        db.add(_make_txn(org_id, user.id, prop.id))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            pdf_bytes = await export_service.export_transactions_pdf(ctx)

        assert len(pdf_bytes) > 100


class TestExportScheduleE:
    @pytest.mark.asyncio
    async def test_schedule_e_pdf_starts_with_magic_bytes(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)
        db.add(_make_txn(org_id, user.id, prop.id))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            pdf_bytes = await export_service.export_schedule_e(ctx, 2025)

        assert pdf_bytes[:5] == b"%PDF-"

    @pytest.mark.asyncio
    async def test_schedule_e_empty_year_still_produces_pdf(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        with patch("app.services.transactions.export_service.AsyncSessionLocal", return_value=db):
            pdf_bytes = await export_service.export_schedule_e(ctx, 2025)

        assert pdf_bytes[:5] == b"%PDF-"


class TestExportTaxSummary:
    @pytest.mark.asyncio
    async def test_tax_summary_pdf_starts_with_magic_bytes(self, db: AsyncSession) -> None:
        user, org_id, prop = await _setup(db)
        db.add(_make_txn(org_id, user.id, prop.id))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        mock_tax_data = {
            "year": 2025,
            "gross_revenue": 5000.0,
            "total_deductions": 2000.0,
            "net_taxable_income": 3000.0,
            "by_category": {"maintenance": 1000.0, "insurance": 1000.0},
            "by_property": [
                {"property_id": str(prop.id), "name": "Beach House", "revenue": 5000.0, "expenses": 2000.0, "net_income": 3000.0},
            ],
        }

        with patch("app.services.transactions.summary_service.get_tax_summary", new_callable=AsyncMock, return_value=mock_tax_data):
            pdf_bytes = await export_service.export_tax_summary(ctx, 2025)

        assert pdf_bytes[:5] == b"%PDF-"
