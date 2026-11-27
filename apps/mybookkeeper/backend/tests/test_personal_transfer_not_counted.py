"""A personal transfer counts towards no total: dashboard, reports, tax, cash
flow, budget, the rent ledger or monthly expenses.

Each query is run with one ordinary row and one personal transfer that is
otherwise identical; only the ordinary row may show up.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_total_inputs import tax_total_inputs
from app.models.transactions.transaction import Transaction
from app.repositories.budgets import personal_spending_repo
from app.repositories.cash_flow import cash_flow_repo
from app.repositories.monthly_expenses import monthly_expense_repo
from app.repositories.rent import rent_charge_repo
from app.repositories.transactions import summary_repo

_DAY = _dt.date(2026, 11, 3)
_START, _END = _dt.date(2026, 11, 1), _dt.date(2026, 11, 30)


async def _pair(db: AsyncSession, **fields: object) -> tuple[Transaction, Transaction]:
    """An approved row and a personal transfer that was approved before marking."""
    org_id, user_id = fields.pop("organization_id"), fields.pop("user_id")
    rows = []
    for status, prior, amount in (("approved", None, "100.00"), ("personal_transfer", "approved", "384.75")):
        txn = Transaction(
            id=uuid.uuid4(), organization_id=org_id, user_id=user_id, transaction_date=_DAY,
            tax_year=2026, amount=amount, status=status, status_before_personal_transfer=prior,
            is_manual=True, **fields,
        )
        db.add(txn)
        rows.append(txn)
    await db.flush()
    return rows[0], rows[1]


@pytest.fixture
def ids() -> dict[str, uuid.UUID]:
    return {"organization_id": uuid.uuid4(), "user_id": uuid.uuid4()}


@pytest.mark.asyncio
async def test_dashboard_and_reports(db: AsyncSession, ids) -> None:
    await _pair(db, **ids, transaction_type="income", category="rental_revenue")
    rows = await summary_repo.txn_sum_by_category(db, ids["organization_id"])
    assert [(r.tag, Decimal(str(r.total))) for r in rows] == [("rental_revenue", Decimal("100.00"))]


@pytest.mark.asyncio
async def test_tax_totals(db: AsyncSession, ids) -> None:
    counted, personal = await _pair(
        db, **ids, transaction_type="income", category="rental_revenue", tax_relevant=True,
    )
    assert tax_total_inputs(counted) is not None
    assert tax_total_inputs(personal) is None


@pytest.mark.asyncio
async def test_cash_flow(db: AsyncSession, ids) -> None:
    await _pair(db, **ids, transaction_type="income", category="rental_revenue")
    totals = await cash_flow_repo.totals_by_month(
        db, organization_id=ids["organization_id"], start=_START, end=_END,
        transaction_scope=None, account_id=None, bank_history_start=None,
    )
    assert [Decimal(str(t[-1])) for t in totals] == [Decimal("100.00")]


@pytest.mark.asyncio
async def test_budget(db: AsyncSession, ids) -> None:
    await _pair(
        db, **ids, transaction_type="expense", category="uncategorized", transaction_scope="personal",
    )
    totals = await personal_spending_repo.totals_by_category(
        db, organization_id=ids["organization_id"], start=_START, end=_END,
    )
    assert [t[2] for t in totals] == [Decimal("100.00")]


@pytest.mark.asyncio
async def test_rent_ledger(db: AsyncSession, ids) -> None:
    applicant_id = uuid.uuid4()
    counted, _ = await _pair(
        db, **ids, transaction_type="income", category="rental_revenue", applicant_id=applicant_id,
    )
    payments = await rent_charge_repo.list_payments_for_applicant(
        db, organization_id=ids["organization_id"], applicant_id=applicant_id,
    )
    assert [p.id for p in payments] == [counted.id]


@pytest.mark.asyncio
async def test_rent_ledger_skips_a_personal_transfer_still_pending_review(db: AsyncSession, ids) -> None:
    """The ledger counts reviewable rows, so it needs its own exclusion."""
    applicant_id = uuid.uuid4()
    txn = Transaction(
        id=uuid.uuid4(), **ids, transaction_date=_DAY, tax_year=2026, amount="384.75",
        transaction_type="income", category="rental_revenue", applicant_id=applicant_id,
        status="personal_transfer", status_before_personal_transfer="pending", is_manual=True,
    )
    db.add(txn)
    await db.flush()
    assert await rent_charge_repo.list_payments_for_applicant(
        db, organization_id=ids["organization_id"], applicant_id=applicant_id,
    ) == []


@pytest.mark.asyncio
async def test_monthly_expenses(db: AsyncSession, ids) -> None:
    counted, _ = await _pair(db, **ids, transaction_type="expense", category="maintenance")
    rows = await monthly_expense_repo.list_outflows(
        db, organization_id=ids["organization_id"], start=_START, end=_END, transaction_scope=None,
        bank_history_start=None,
    )
    assert [r.id for r in rows] == [counted.id]
