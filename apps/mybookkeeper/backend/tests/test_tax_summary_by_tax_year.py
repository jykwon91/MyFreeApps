"""The Tax Report counts each row in the tax year it's filed under, not the year of its date.

A December rent payment that cleared on 2026-01-02 but is filed for 2025 belongs to the
2025 return, the same place Schedule E puts it. The tax summary (Tax Report page, phone
tax report and Tax Summary PDF) must agree.
"""
import io
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo
from app.services.transactions import export_service, summary_service

_JUNE_RENT = Decimal("2000.00")
_LATE_DECEMBER_RENT = Decimal("1234.00")
_RENT_LINE = "line_3_rents_received"


def _session_factory(db: AsyncSession) -> Callable[[], AbstractAsyncContextManager[AsyncSession]]:
    @asynccontextmanager
    async def _fake() -> AsyncIterator[AsyncSession]:
        yield db

    return _fake


def _rent(
    org: Organization, user: User, prop: Property, *, amount: Decimal, transaction_date: date, tax_year: int,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        transaction_date=transaction_date,
        tax_year=tax_year,
        vendor="Tenant",
        amount=amount,
        transaction_type="income",
        category="rental_revenue",
        tags=["rental_revenue"],
        schedule_e_line=_RENT_LINE,
        status="approved",
        tax_relevant=True,
    )


async def _seed(db: AsyncSession, org: Organization, user: User) -> Property:
    """June 2025 rent, plus December's rent dated 2026-01-02 but filed for 2025."""
    prop = Property(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Duplex", address="1 Main St",
    )
    db.add(prop)
    await db.flush()
    db.add_all([
        _rent(org, user, prop, amount=_JUNE_RENT, transaction_date=date(2025, 6, 1), tax_year=2025),
        _rent(org, user, prop, amount=_LATE_DECEMBER_RENT, transaction_date=date(2026, 1, 2), tax_year=2025),
    ])
    await db.commit()
    return prop


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


class TestTaxSummaryUsesTaxYear:
    @pytest.mark.asyncio
    async def test_row_dated_january_but_filed_for_prior_year_counts_in_that_year(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed(db, test_org, test_user)

        with patch("app.services.transactions.summary_service.AsyncSessionLocal", _session_factory(db)):
            summary_2025 = await summary_service.get_tax_summary(_ctx(test_org, test_user), 2025)
            summary_2026 = await summary_service.get_tax_summary(_ctx(test_org, test_user), 2026)

        assert summary_2025["gross_revenue"] == float(_JUNE_RENT + _LATE_DECEMBER_RENT)
        assert summary_2025["by_property"][0]["revenue"] == float(_JUNE_RENT + _LATE_DECEMBER_RENT)
        assert summary_2026["gross_revenue"] == 0.0
        assert summary_2026["by_category"] == {}
        assert summary_2026["by_property"] == []

    @pytest.mark.asyncio
    async def test_tax_summary_matches_schedule_e(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed(db, test_org, test_user)

        with patch("app.services.transactions.summary_service.AsyncSessionLocal", _session_factory(db)):
            summary = await summary_service.get_tax_summary(_ctx(test_org, test_user), 2025)
        schedule_e = await transaction_repo.schedule_e_report(db, test_org.id, 2025)

        rent_on_schedule_e = {(r.property_id, r.schedule_e_line): r.total_amount for r in schedule_e}
        assert summary["by_category"]["rental_revenue"] == float(rent_on_schedule_e[(prop.id, _RENT_LINE)])

    @pytest.mark.asyncio
    async def test_tax_summary_pdf_shows_the_tax_year_totals(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed(db, test_org, test_user)

        with patch("app.services.transactions.summary_service.AsyncSessionLocal", _session_factory(db)):
            pdf_2025 = await export_service.export_tax_summary(_ctx(test_org, test_user), 2025)
            pdf_2026 = await export_service.export_tax_summary(_ctx(test_org, test_user), 2026)

        text_2025 = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf_2025)).pages)
        text_2026 = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf_2026)).pages)
        assert "$3,234.00" in text_2025
        assert "$1,234.00" not in text_2026
        assert "$0.00" in text_2026
