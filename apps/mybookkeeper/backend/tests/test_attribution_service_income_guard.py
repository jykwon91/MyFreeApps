"""Attribution must never run on an expense.

Rent-payment attribution links a payment/payout to a tenant or property and
stamps ``category="rental_revenue"``. A property-management statement (e.g.
Vello) produces both a rental-income line AND a management-commission *expense*
line. Before the income guard, the expense line was fed through attribution,
which force-set ``category="rental_revenue"`` while leaving
``transaction_type="expense"`` (and ``schedule_e_line="line_8_commissions"``)
intact. That contradictory row violates the ``chk_txn_type_category`` check
constraint at insert time and fails the whole sync item.

The guard early-returns for any non-income transaction, in both the tenant
payer-name path and the Airbnb-payout path. The positive (income still
attributes) case is covered in ``test_attribution_service_auto_verifies.py``;
the sanity test here just locks the boundary.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.properties.property import Property
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.services.transactions.attribution_service import maybe_attribute_payment

_RECEIPT_PATCH = (
    "app.services.transactions.attribution_service.receipt_service"
    ".create_pending_receipt_in_session"
)


async def _make_applicant(db, org_id, user_id, name="Prince Kapoor") -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        stage="lease_signed", legal_name=name,
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def _make_txn(
    db, org_id, user_id, *,
    transaction_type: str,
    category: str,
    payer_name: str | None = None,
    description: str | None = None,
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        transaction_date=_dt.date(2026, 6, 1), tax_year=2026, amount="444.42",
        transaction_type=transaction_type, category=category, status="approved",
        is_manual=False, payer_name=payer_name, description=description,
    )
    db.add(txn)
    await db.flush()
    return txn


async def _review_rows(db: AsyncSession, txn_id: uuid.UUID) -> list:
    return list(
        (
            await db.execute(
                select(RentAttributionReviewQueue).where(
                    RentAttributionReviewQueue.transaction_id == txn_id
                )
            )
        ).scalars()
    )


@pytest.mark.asyncio
async def test_expense_is_not_attributed_via_payer_name(db: AsyncSession):
    """A management-fee expense whose payer name exactly matches a tenant must
    NOT be attributed — category/type stay put and nothing is queued."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    # Exact-name candidate that WOULD auto-attribute were this income.
    await _make_applicant(db, org_id, user_id, "Vello")
    txn = await _make_txn(
        db, org_id, user_id,
        transaction_type="expense", category="management_fee",
        payer_name="Vello",
        description="Vello property management commission — billing period 6/1 to 6/15",
    )

    with patch(_RECEIPT_PATCH, new_callable=AsyncMock) as receipt_mock:
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Vello",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id is None
    assert txn.attribution_source is None
    assert txn.category == "management_fee"  # never overwritten to rental_revenue
    assert txn.transaction_type == "expense"
    receipt_mock.assert_not_awaited()
    assert await _review_rows(db, txn.id) == []


@pytest.mark.asyncio
async def test_expense_is_not_attributed_via_airbnb_payout_path(db: AsyncSession):
    """The same guard applies on the Airbnb-payout path: an expense line whose
    res_code matches a booking statement must NOT be stamped rental_revenue."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="Beach House")
    stmt = BookingStatement(
        id=uuid.uuid4(), organization_id=org_id, property_id=prop.id, res_code="HM12345",
        check_in=_dt.date(2026, 5, 20), check_out=_dt.date(2026, 5, 25),
    )
    db.add_all([prop, stmt])
    await db.flush()
    txn = await _make_txn(
        db, org_id, user_id,
        transaction_type="expense", category="management_fee",
        description="Management fee for reservation HM12345",
    )

    with patch(
        "app.services.transactions.attribution_service.listing_repo.list_by_channel",
        new_callable=AsyncMock, return_value=[],
    ):
        await maybe_attribute_payment(
            db, txn=txn, payer_name=None, organization_id=org_id, user_id=user_id,
            is_airbnb_payout=True,
        )

    assert txn.property_id is None
    assert txn.attribution_source is None
    assert txn.category == "management_fee"
    assert txn.transaction_type == "expense"
    assert await _review_rows(db, txn.id) == []


@pytest.mark.asyncio
async def test_income_payment_is_still_attributed(db: AsyncSession):
    """Boundary check: the guard blocks only non-income — a matching income
    payment still auto-attributes and is stamped rental_revenue."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    txn = await _make_txn(
        db, org_id, user_id,
        transaction_type="income", category="uncategorized",
        payer_name="Prince Kapoor",
    )

    with patch(_RECEIPT_PATCH, new_callable=AsyncMock):
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Prince Kapoor",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id == prince.id
    assert txn.attribution_source == "auto_exact"
    assert txn.category == "rental_revenue"
