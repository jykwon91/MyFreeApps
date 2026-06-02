"""Service-level test for attribution_service.attribute_manually.

The newer behavior added 2026-05-08: when a host manually attributes a
transaction that has a pending review-queue row, the row is resolved as
``confirmed`` in the same transaction so the host doesn't have to also
reject it from the review queue UI.

This test does NOT exercise the Airbnb auto-pipeline path (covered by
attribution_matcher / repo tests); it focuses strictly on the manual-
attribute service surface.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch, AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.services.transactions.attribution_service import attribute_manually


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session

    return _fake_uow


@pytest.mark.asyncio
async def test_attribute_manually_resolves_pending_review_row(db: AsyncSession):
    """Manual attribute on a txn that has a pending review row resolves the row."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Jane Doe",
    )
    db.add(applicant)

    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        transaction_date=_dt.date(2026, 5, 1),
        tax_year=2026,
        amount="1500.00",
        transaction_type="income",
        category="uncategorized",
        status="approved",
        is_manual=False,
    )
    db.add(txn)

    review = RentAttributionReviewQueue(
        id=uuid.uuid4(),
        user_id=user_id,
        organization_id=org_id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
        status="pending",
    )
    db.add(review)
    await db.flush()

    fake_uow = _make_fake_uow(db)

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        fake_uow,
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        result = await attribute_manually(
            transaction_id=txn.id,
            applicant_id=applicant.id,
            organization_id=org_id,
            user_id=user_id,
        )

    assert result["ok"] is True

    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.applicant_id == applicant.id
    assert refreshed_txn.attribution_source == "manual"
    assert refreshed_txn.category == "rental_revenue"

    refreshed_review = (
        await db.execute(
            select(RentAttributionReviewQueue).where(RentAttributionReviewQueue.id == review.id)
        )
    ).scalar_one()
    assert refreshed_review.status == "confirmed"
    assert refreshed_review.resolved_at is not None


@pytest.mark.asyncio
async def test_attribute_manually_no_review_row_works(db: AsyncSession):
    """If there is no review row, manual attribute still succeeds (no-op for the queue)."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Jane Doe",
    )
    db.add(applicant)

    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        transaction_date=_dt.date(2026, 5, 1),
        tax_year=2026,
        amount="1500.00",
        transaction_type="income",
        category="uncategorized",
        status="approved",
        is_manual=False,
    )
    db.add(txn)
    await db.flush()

    fake_uow = _make_fake_uow(db)

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        fake_uow,
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        result = await attribute_manually(
            transaction_id=txn.id,
            applicant_id=applicant.id,
            organization_id=org_id,
            user_id=user_id,
        )

    assert result["ok"] is True
    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.applicant_id == applicant.id


@pytest.mark.asyncio
async def test_attribute_manually_promotes_unverified_to_approved(db: AsyncSession):
    """Manually linking a tenant verifies an unverified payment → status approved.

    Reproduces the reported bug: a Zelle payment extracted from an email body
    lands as ``unverified`` with no UI affordance to approve it. Attributing it
    to a tenant must promote it to ``approved`` so it reaches the dashboard.
    """
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Andrew Le",
    )
    db.add(applicant)

    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        transaction_date=_dt.date(2026, 6, 1),
        tax_year=2026,
        amount="1595.00",
        transaction_type="income",
        category="uncategorized",
        status="unverified",
        is_manual=False,
    )
    db.add(txn)
    await db.flush()

    fake_uow = _make_fake_uow(db)

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        fake_uow,
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        result = await attribute_manually(
            transaction_id=txn.id,
            applicant_id=applicant.id,
            organization_id=org_id,
            user_id=user_id,
        )

    assert result["ok"] is True
    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.applicant_id == applicant.id
    assert refreshed_txn.status == "approved"
