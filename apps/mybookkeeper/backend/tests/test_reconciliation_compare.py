"""Comparing tax forms with the transactions on record."""
import datetime as dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.tax.discrepancy_scanner_service import _scan_1099_gaps
from app.services.transactions import reconciliation_route_service

TAX_YEAR = 2025


@pytest.fixture(autouse=True)
def _same_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db

    with patch("app.services.transactions.reconciliation_route_service.unit_of_work", _uow):
        yield


def _context(user: User, org: Organization) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


def _income(user: User, org: Organization, amount: str, **overrides: object) -> Transaction:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": dt.date(TAX_YEAR, 5, 1),
        "tax_year": TAX_YEAR,
        "amount": Decimal(amount),
        "vendor": "Airbnb",
        "transaction_type": "income",
        "category": "rental_revenue",
        "status": "approved",
        "tax_relevant": True,
        "is_manual": True,
    }
    return Transaction(**{**values, **overrides})


def _form(user: User, org: Organization, reported: str, **overrides: object) -> ReconciliationSource:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organization_id": org.id,
        "user_id": user.id,
        "source_type": "1099_k",
        "tax_year": TAX_YEAR,
        "issuer": "Airbnb",
        "reported_amount": Decimal(reported),
        "matched_amount": Decimal("0"),
        "status": "unmatched",
    }
    return ReconciliationSource(**{**values, **overrides})


async def _compare(db: AsyncSession, user: User, org: Organization) -> dict[str, int]:
    return await reconciliation_route_service.auto_reconcile(_context(user, org), TAX_YEAR)


@pytest.mark.asyncio
async def test_a_form_that_matches_my_income_is_matched(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    form = _form(test_user, test_org, "12000.00")
    db.add_all([form, _income(test_user, test_org, "7000.00"), _income(test_user, test_org, "5000.00")])
    await db.flush()

    assert await _compare(db, test_user, test_org) == {"sources_checked": 1, "auto_matched": 1, "discrepancies": 0}
    assert form.status == "matched"
    assert form.matched_amount == Decimal("12000.00")


@pytest.mark.asyncio
async def test_a_form_that_differs_is_partly_matched(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    form = _form(test_user, test_org, "12000.00")
    db.add_all([form, _income(test_user, test_org, "11500.00")])
    await db.flush()

    assert await _compare(db, test_user, test_org) == {"sources_checked": 1, "auto_matched": 0, "discrepancies": 1}
    assert form.status == "partial"
    assert form.matched_amount == Decimal("11500.00")


@pytest.mark.asyncio
async def test_fees_paid_to_the_same_vendor_do_not_count_as_income(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    form = _form(test_user, test_org, "12000.00")
    fee = _income(test_user, test_org, "360.00", transaction_type="expense", category="management_fee")
    db.add_all([form, _income(test_user, test_org, "12000.00"), fee])
    await db.flush()

    await _compare(db, test_user, test_org)

    assert form.status == "matched"
    assert form.matched_amount == Decimal("12000.00")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "left_out",
    [
        {"status": "pending"},
        {"tax_relevant": False},
        {"deleted_at": dt.datetime(TAX_YEAR, 6, 1, tzinfo=dt.timezone.utc)},
        {"tax_year": TAX_YEAR - 1, "transaction_date": dt.date(TAX_YEAR - 1, 5, 1)},
        {"vendor": "Vrbo"},
    ],
)
async def test_other_transactions_are_left_out(
    db: AsyncSession, test_user: User, test_org: Organization, left_out: dict[str, object],
) -> None:
    form = _form(test_user, test_org, "1000.00")
    db.add_all([form, _income(test_user, test_org, "1000.00", **left_out)])
    await db.flush()

    assert await _compare(db, test_user, test_org) == {"sources_checked": 1, "auto_matched": 0, "discrepancies": 0}
    assert form.status == "unmatched"


@pytest.mark.asyncio
async def test_another_workspaces_income_is_left_out(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    form = _form(test_user, test_org, "1000.00")
    db.add_all([form, _income(test_user, test_org, "1000.00", organization_id=uuid.uuid4())])
    await db.flush()

    await _compare(db, test_user, test_org)

    assert form.status == "unmatched"


@pytest.mark.asyncio
async def test_the_issuer_finds_its_vendor_despite_case_and_company_suffix(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    form = _form(test_user, test_org, "1000.00", issuer="AIRBNB, Inc.")
    db.add_all([form, _income(test_user, test_org, "1000.00", vendor="airbnb")])
    await db.flush()

    await _compare(db, test_user, test_org)

    assert form.status == "matched"


@pytest.mark.asyncio
async def test_a_gap_under_a_dollar_is_matched(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    form = _form(test_user, test_org, "1000.00")
    db.add_all([form, _income(test_user, test_org, "999.50")])
    await db.flush()

    await _compare(db, test_user, test_org)

    assert form.status == "matched"


@pytest.mark.asyncio
async def test_a_gap_of_exactly_a_dollar_differs(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    form = _form(test_user, test_org, "1000.00")
    db.add_all([form, _income(test_user, test_org, "999.00")])
    await db.flush()

    await _compare(db, test_user, test_org)

    assert form.status == "partial"


@pytest.mark.asyncio
async def test_fees_do_not_hide_a_gap_from_the_tax_scan(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    fee = _income(test_user, test_org, "600.00", transaction_type="expense", category="management_fee")
    db.add_all([_form(test_user, test_org, "1000.00"), _income(test_user, test_org, "400.00"), fee])
    await db.flush()

    [gap] = await _scan_1099_gaps(db, test_org.id, TAX_YEAR)

    assert "a gap of $600.00" in gap.description


@pytest.mark.asyncio
async def test_a_form_with_no_issuer_is_checked_but_has_nothing_to_compare(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    form = _form(test_user, test_org, "1000.00", issuer=None)
    db.add_all([form, _income(test_user, test_org, "1000.00")])
    await db.flush()

    assert await _compare(db, test_user, test_org) == {"sources_checked": 1, "auto_matched": 0, "discrepancies": 0}
    assert form.status == "unmatched"


@pytest.mark.asyncio
async def test_a_confirmed_form_is_left_alone(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    form = _form(test_user, test_org, "1000.00", status="confirmed", matched_amount=Decimal("900.00"))
    db.add_all([form, _income(test_user, test_org, "1000.00")])
    await db.flush()

    assert await _compare(db, test_user, test_org) == {"sources_checked": 0, "auto_matched": 0, "discrepancies": 0}
    assert form.status == "confirmed"
    assert form.matched_amount == Decimal("900.00")


@pytest.mark.asyncio
async def test_comparing_again_after_the_income_is_gone_clears_the_old_match(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    form = _form(test_user, test_org, "1000.00")
    income = _income(test_user, test_org, "1000.00")
    db.add_all([form, income])
    await db.flush()
    await _compare(db, test_user, test_org)
    assert form.status == "matched"

    income.deleted_at = dt.datetime(TAX_YEAR, 6, 1, tzinfo=dt.timezone.utc)
    await db.flush()

    assert await _compare(db, test_user, test_org) == {"sources_checked": 1, "auto_matched": 0, "discrepancies": 0}
    assert form.status == "unmatched"
    assert form.matched_amount == Decimal("0")
