"""Auto-attribution verifies the payment (status -> approved).

The dashboard sums only ``status='approved'``. A payment extracted from a
non-trusted email sender (e.g. a bank-routed Zelle alert) is created
``unverified``; when the auto-pipeline confidently attributes it (learned payer
alias, exact name match, or Airbnb-auto), that attribution must promote it to
``approved`` — exactly as the manual confirm/link paths do — so recurring rent
reaches the dashboard without the host re-approving every month.

The negative case (fuzzy / unmatched) must NOT promote: those go to the review
queue and stay ``unverified`` until the host confirms.
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
from app.repositories.transactions import payer_alias_repo
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


async def _make_unverified_txn(db, org_id, user_id, *, payer_name=None, description=None) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        transaction_date=_dt.date(2026, 6, 1), tax_year=2026, amount="1595.00",
        transaction_type="income", category="uncategorized", status="unverified",
        is_manual=False, payer_name=payer_name, description=description,
    )
    db.add(txn)
    await db.flush()
    return txn


async def _status_of(db: AsyncSession, txn_id: uuid.UUID) -> str:
    return (
        await db.execute(select(Transaction.status).where(Transaction.id == txn_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_alias_auto_attribution_promotes_unverified_to_approved(db: AsyncSession):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="Tushar Kapoor", applicant_id=prince.id, source="manual_link",
    )
    txn = await _make_unverified_txn(db, org_id, user_id, payer_name="Tushar Kapoor")

    with patch(_RECEIPT_PATCH, new_callable=AsyncMock):
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Tushar Kapoor",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id == prince.id
    assert txn.attribution_source == "auto_alias"
    assert await _status_of(db, txn.id) == "approved"


@pytest.mark.asyncio
async def test_exact_name_match_promotes_unverified_to_approved(db: AsyncSession):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    txn = await _make_unverified_txn(db, org_id, user_id, payer_name="Prince Kapoor")

    with patch(_RECEIPT_PATCH, new_callable=AsyncMock):
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Prince Kapoor",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id == prince.id
    assert txn.attribution_source == "auto_exact"
    assert await _status_of(db, txn.id) == "approved"


@pytest.mark.asyncio
async def test_airbnb_auto_attribution_promotes_unverified_to_approved(db: AsyncSession):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="Beach House")
    stmt = BookingStatement(
        id=uuid.uuid4(), organization_id=org_id, property_id=prop.id, res_code="HM12345",
        check_in=_dt.date(2026, 5, 20), check_out=_dt.date(2026, 5, 25),
    )
    txn = await _make_unverified_txn(
        db, org_id, user_id, description="Payout for reservation HM12345"
    )
    db.add_all([prop, stmt])
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.listing_repo.list_by_channel",
        new_callable=AsyncMock, return_value=[],
    ):
        await maybe_attribute_payment(
            db, txn=txn, payer_name=None, organization_id=org_id, user_id=user_id,
            is_airbnb_payout=True,
        )

    assert txn.property_id == prop.id
    assert txn.attribution_source == "auto_exact"
    assert await _status_of(db, txn.id) == "approved"


@pytest.mark.asyncio
async def test_unmatched_payment_stays_unverified(db: AsyncSession):
    """No alias, no name candidate → review queue; status must NOT be promoted."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    txn = await _make_unverified_txn(db, org_id, user_id, payer_name="Nobody Known")

    with patch(_RECEIPT_PATCH, new_callable=AsyncMock) as receipt_mock:
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Nobody Known",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id is None
    receipt_mock.assert_not_awaited()
    assert await _status_of(db, txn.id) == "unverified"
    review = (
        await db.execute(
            select(RentAttributionReviewQueue).where(
                RentAttributionReviewQueue.transaction_id == txn.id
            )
        )
    ).scalar_one()
    assert review.confidence == "unmatched"
