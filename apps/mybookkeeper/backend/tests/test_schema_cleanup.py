"""Tests for schema cleanup: FK cascades, filing_status dedup, org_id NOT NULL, new tax vision tables."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization import Organization
from app.models.organization.tax_profile import TaxProfile
from app.models.properties.property import Property, PropertyType
from app.models.tax.cost_basis_lot import CostBasisLot
from app.models.tax.estimated_tax_payment import EstimatedTaxPayment
from app.models.tax.tax_carryforward import TaxCarryforward
from app.models.tax.tax_return import TaxReturn
from app.models.tax.tax_year_profile import TaxYearProfile
from app.models.transactions.transaction import Transaction
from app.models.user.user import User


@pytest_asyncio.fixture()
async def user(db: AsyncSession) -> User:
    u = User(
        id=uuid.uuid4(),
        email="schema-test@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture()
async def org(db: AsyncSession, user: User) -> Organization:
    from app.models.organization.organization_member import OrganizationMember
    o = Organization(id=uuid.uuid4(), name="Schema Test Org", created_by=user.id)
    db.add(o)
    await db.flush()
    m = OrganizationMember(organization_id=o.id, user_id=user.id, org_role="owner")
    db.add(m)
    await db.commit()
    await db.refresh(o)
    return o


class TestPlatformSettingsDecimal:
    """PlatformSettings uses Decimal, not float."""

    def test_model_column_type_is_numeric(self) -> None:
        from app.models.system.platform_settings import PlatformSettings
        col = PlatformSettings.__table__.c.cost_input_rate_per_million
        assert str(col.type) == "NUMERIC(10, 4)"
        # Mapped type annotation uses Decimal (not float)
        assert "Decimal" in str(PlatformSettings.__annotations__["cost_input_rate_per_million"])


class TestFilingStatusDedup:
    """filing_status removed from TaxProfile, kept on TaxYearProfile and TaxReturn."""

    def test_tax_profile_no_filing_status(self) -> None:
        assert not hasattr(TaxProfile, "filing_status") or "filing_status" not in TaxProfile.__table__.columns

    @pytest.mark.anyio
    async def test_tax_year_profile_has_filing_status(self, db: AsyncSession, user: User, org: Organization) -> None:
        typ = TaxYearProfile(
            organization_id=org.id,
            tax_year=2025,
            filing_status="married_filing_jointly",
        )
        db.add(typ)
        await db.commit()
        await db.refresh(typ)
        assert typ.filing_status == "married_filing_jointly"

    @pytest.mark.anyio
    async def test_tax_return_has_filing_status(self, db: AsyncSession, org: Organization) -> None:
        tr = TaxReturn(
            organization_id=org.id,
            tax_year=2025,
            filing_status="single",
            jurisdiction="federal",
        )
        db.add(tr)
        await db.commit()
        await db.refresh(tr)
        assert tr.filing_status == "single"


class TestTaxReturnJurisdiction:
    """TaxReturn has jurisdiction column with federal default."""

    @pytest.mark.anyio
    async def test_default_jurisdiction(self, db: AsyncSession, org: Organization) -> None:
        tr = TaxReturn(organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.commit()
        await db.refresh(tr)
        assert tr.jurisdiction == "federal"

    @pytest.mark.anyio
    async def test_state_jurisdiction(self, db: AsyncSession, org: Organization) -> None:
        tr = TaxReturn(
            organization_id=org.id,
            tax_year=2025,
            jurisdiction="CA",
        )
        db.add(tr)
        await db.commit()
        await db.refresh(tr)
        assert tr.jurisdiction == "CA"


class TestOrganizationIdNotNull:
    """organization_id is NOT NULL on key tables."""

    @pytest.mark.anyio
    async def test_document_requires_org_id(self, db: AsyncSession, user: User, org: Organization) -> None:
        doc = Document(
            organization_id=org.id,
            user_id=user.id,
            file_name="test.pdf",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        assert doc.organization_id == org.id

    @pytest.mark.anyio
    async def test_property_requires_org_id(self, db: AsyncSession, user: User, org: Organization) -> None:
        prop = Property(
            organization_id=org.id,
            user_id=user.id,
            name="Test Property",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.commit()
        await db.refresh(prop)
        assert prop.organization_id == org.id


class TestCostBasisLot:
    """CostBasisLot model for investment tracking."""

    @pytest.mark.anyio
    async def test_create_lot(self, db: AsyncSession, user: User, org: Organization) -> None:
        lot = CostBasisLot(
            organization_id=org.id,
            user_id=user.id,
            asset_name="AAPL",
            asset_type="stock",
            ticker="AAPL",
            shares=Decimal("10.0"),
            cost_basis=Decimal("1500.00"),
            acquisition_date=date(2024, 1, 15),
            tax_year=2025,
        )
        db.add(lot)
        await db.commit()
        await db.refresh(lot)
        assert lot.asset_name == "AAPL"
        assert lot.shares == Decimal("10.0")
        assert lot.sale_date is None

    @pytest.mark.anyio
    async def test_sold_lot_with_gain(self, db: AsyncSession, user: User, org: Organization) -> None:
        lot = CostBasisLot(
            organization_id=org.id,
            user_id=user.id,
            asset_name="TSLA",
            asset_type="stock",
            ticker="TSLA",
            shares=Decimal("5.0"),
            cost_basis=Decimal("1000.00"),
            acquisition_date=date(2024, 3, 1),
            sale_date=date(2025, 6, 15),
            proceeds=Decimal("1500.00"),
            gain_loss=Decimal("500.00"),
            tax_year=2025,
            holding_period="long_term",
        )
        db.add(lot)
        await db.commit()
        await db.refresh(lot)
        assert lot.gain_loss == Decimal("500.00")
        assert lot.holding_period == "long_term"


class TestEstimatedTaxPayment:
    """EstimatedTaxPayment model for quarterly payments."""

    @pytest.mark.anyio
    async def test_create_payment(self, db: AsyncSession, user: User, org: Organization) -> None:
        payment = EstimatedTaxPayment(
            organization_id=org.id,
            user_id=user.id,
            tax_year=2025,
            quarter=1,
            amount=Decimal("2500.00"),
            payment_date=date(2025, 4, 15),
            jurisdiction="federal",
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        assert payment.quarter == 1
        assert payment.amount == Decimal("2500.00")

    @pytest.mark.anyio
    async def test_state_estimated_payment(self, db: AsyncSession, user: User, org: Organization) -> None:
        payment = EstimatedTaxPayment(
            organization_id=org.id,
            user_id=user.id,
            tax_year=2025,
            quarter=2,
            amount=Decimal("800.00"),
            payment_date=date(2025, 6, 15),
            jurisdiction="CA",
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        assert payment.jurisdiction == "CA"


class TestTaxCarryforward:
    """TaxCarryforward model for loss carryforwards."""

    @pytest.mark.anyio
    async def test_create_carryforward(self, db: AsyncSession, org: Organization) -> None:
        cf = TaxCarryforward(
            organization_id=org.id,
            carryforward_type="capital_loss",
            from_year=2024,
            to_year=2025,
            amount=Decimal("3000.00"),
            amount_used=Decimal("0"),
            remaining=Decimal("3000.00"),
        )
        db.add(cf)
        await db.commit()
        await db.refresh(cf)
        assert cf.carryforward_type == "capital_loss"
        assert cf.remaining == Decimal("3000.00")

    @pytest.mark.anyio
    async def test_partial_use(self, db: AsyncSession, org: Organization) -> None:
        cf = TaxCarryforward(
            organization_id=org.id,
            carryforward_type="net_operating_loss",
            from_year=2023,
            to_year=2025,
            amount=Decimal("10000.00"),
            amount_used=Decimal("4000.00"),
            remaining=Decimal("6000.00"),
        )
        db.add(cf)
        await db.commit()
        await db.refresh(cf)
        assert cf.amount_used == Decimal("4000.00")


class TestSourcesAttachedRemoved:
    """sources_attached dead code removed from UploadResult."""

    def test_upload_result_no_sources_attached(self) -> None:
        from app.models.responses.upload_result import UploadResult
        ur = UploadResult()
        assert not hasattr(ur, "sources_attached")


class TestUserFkCascade:
    """User FK on Transaction, Extraction has ondelete CASCADE in model."""

    def test_transaction_user_fk_cascade(self) -> None:
        col = Transaction.__table__.c.user_id
        fk = list(col.foreign_keys)[0]
        assert fk.ondelete == "CASCADE"

    def test_extraction_user_fk_cascade(self) -> None:
        col = Extraction.__table__.c.user_id
        fk = list(col.foreign_keys)[0]
        assert fk.ondelete == "CASCADE"
