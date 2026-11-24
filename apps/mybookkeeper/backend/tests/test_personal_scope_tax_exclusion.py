"""Personal-scope transactions must be excluded from all tax-report totals.

Creates a mix of rental + personal transactions, then verifies that
summary_repo.txn_sum_by_category omits the personal ones from the total.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import summary_repo

pytestmark = pytest.mark.asyncio


def _txn(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    prop_id: uuid.UUID | None,
    *,
    amount: Decimal,
    category: str,
    transaction_type: str = "expense",
    scope: str = "rental",
    tax_relevant: bool = True,
    schedule_e_line: str | None = "line_7_cleaning_maintenance",
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=prop_id,
        amount=amount,
        category=category,
        transaction_type=transaction_type,
        transaction_scope=scope,
        tax_relevant=tax_relevant,
        schedule_e_line=schedule_e_line if tax_relevant else None,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        status="approved",
        vendor="Test Vendor",
        tags=[category],
    )


async def test_personal_expense_excluded_from_summary(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    prop = Property(
        id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
        name="Test Property", address="123 Main St",
    )
    db.add(prop)

    # Rental expense: should count toward tax totals
    db.add(_txn(test_org.id, test_user.id, prop.id, amount=Decimal("200.00"), category="maintenance"))

    # Personal expense: must NOT count
    db.add(_txn(
        test_org.id, test_user.id, prop.id,
        amount=Decimal("500.00"), category="other_expense",
        scope="personal", tax_relevant=False, schedule_e_line=None,
    ))
    await db.commit()

    rows = await summary_repo.txn_sum_by_category(db, test_org.id)
    # Sum of "maintenance" should be 200.00, personal "other_expense" should not appear
    total = sum(row.total for row in rows)
    # Only rental $200 should be included
    assert Decimal(str(total)) == Decimal("200.00")


async def test_personal_income_excluded_from_summary(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    prop = Property(
        id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
        name="Test Property 2", address="456 Oak Ave",
    )
    db.add(prop)

    # Rental income: should count
    db.add(_txn(
        test_org.id, test_user.id, prop.id,
        amount=Decimal("1000.00"), category="rental_revenue",
        transaction_type="income",
        schedule_e_line="line_3_rents_received",
    ))

    # Personal income (e.g. a side job): must NOT count
    db.add(_txn(
        test_org.id, test_user.id, None,
        amount=Decimal("300.00"), category="rental_revenue",
        transaction_type="income",
        scope="personal", tax_relevant=False, schedule_e_line=None,
    ))
    await db.commit()

    rows = await summary_repo.txn_sum_by_category(db, test_org.id)
    income_rows = [r for r in rows if r.tag == "rental_revenue"]
    total_income = sum(Decimal(str(r.total)) for r in income_rows)
    # Only the $1000 rental income should appear
    assert total_income == Decimal("1000.00")
