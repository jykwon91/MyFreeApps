"""Service-level tests for the property-only confirm path of
``attribution_service.confirm_review`` (PR B — Airbnb-payout attribution).

An Airbnb payout has no tenant/applicant — it attributes to a property.
Confirming such a review row must set ``txn.property_id`` (not applicant_id),
mark the source ``manual``, resolve the row, and create NO pending receipt
(receipts are tenant-scoped). The applicant target keeps precedence when both
are present.
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
from app.models.properties.property import Property
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.services.transactions.attribution_service import confirm_review


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session

    return _fake_uow


def _property(org_id: uuid.UUID, user_id: uuid.UUID, name: str = "Beach House") -> Property:
    return Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name=name)


def _txn(org_id: uuid.UUID, user_id: uuid.UUID) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        transaction_date=_dt.date(2026, 5, 1),
        tax_year=2026,
        amount="2500.00",
        transaction_type="income",
        category="uncategorized",
        status="approved",
        is_manual=False,
    )


def _review(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    txn_id: uuid.UUID,
    *,
    proposed_property_id: uuid.UUID | None = None,
    proposed_applicant_id: uuid.UUID | None = None,
) -> RentAttributionReviewQueue:
    return RentAttributionReviewQueue(
        id=uuid.uuid4(),
        user_id=user_id,
        organization_id=org_id,
        transaction_id=txn_id,
        proposed_applicant_id=proposed_applicant_id,
        proposed_property_id=proposed_property_id,
        confidence="unmatched",
        status="pending",
    )


@pytest.mark.asyncio
async def test_confirm_uses_proposed_property(db: AsyncSession):
    """No applicant — confirming sets txn.property_id from proposed_property_id,
    source=manual, row confirmed, and NO receipt is created."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = _property(org_id, user_id)
    txn = _txn(org_id, user_id)
    # Seed a stale prior applicant attribution: the property path must clear it
    # (an Airbnb payout has no tenant), so this assertion is non-trivial.
    txn.applicant_id = uuid.uuid4()
    review = _review(org_id, user_id, txn.id, proposed_property_id=prop.id)
    db.add_all([prop, txn, review])
    await db.flush()

    receipt_mock = AsyncMock()
    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        receipt_mock,
    ):
        result = await confirm_review(
            review_id=review.id, organization_id=org_id, user_id=user_id,
        )

    assert result["ok"] is True
    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.property_id == prop.id
    assert refreshed_txn.applicant_id is None
    assert refreshed_txn.attribution_source == "manual"
    assert refreshed_txn.category == "rental_revenue"

    refreshed_review = (
        await db.execute(
            select(RentAttributionReviewQueue).where(RentAttributionReviewQueue.id == review.id)
        )
    ).scalar_one()
    assert refreshed_review.status == "confirmed"
    assert refreshed_review.resolved_at is not None
    receipt_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_confirm_property_id_override_wins(db: AsyncSession):
    """An explicit property_id arg overrides the proposed property ("pick a
    different room")."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    proposed = _property(org_id, user_id, "Proposed Room")
    chosen = _property(org_id, user_id, "Chosen Room")
    txn = _txn(org_id, user_id)
    review = _review(org_id, user_id, txn.id, proposed_property_id=proposed.id)
    db.add_all([proposed, chosen, txn, review])
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        await confirm_review(
            review_id=review.id,
            organization_id=org_id,
            user_id=user_id,
            property_id=chosen.id,
        )

    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.property_id == chosen.id


@pytest.mark.asyncio
async def test_confirm_property_not_found_fails_closed(db: AsyncSession):
    """A property_id that doesn't exist (or belongs to another org) raises and
    leaves the row pending + transaction untouched."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    txn = _txn(org_id, user_id)
    review = _review(org_id, user_id, txn.id, proposed_property_id=uuid.uuid4())
    db.add_all([txn, review])
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        with pytest.raises(ValueError, match="Property not found"):
            await confirm_review(
                review_id=review.id, organization_id=org_id, user_id=user_id,
            )

    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.property_id is None
    refreshed_review = (
        await db.execute(
            select(RentAttributionReviewQueue).where(RentAttributionReviewQueue.id == review.id)
        )
    ).scalar_one()
    assert refreshed_review.status == "pending"


@pytest.mark.asyncio
async def test_confirm_applicant_takes_precedence_over_property(db: AsyncSession):
    """A row with BOTH a proposed applicant and a proposed property resolves
    via the applicant path (receipt created); the property path is not taken."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Jane Doe",
    )
    prop = _property(org_id, user_id)
    txn = _txn(org_id, user_id)
    review = _review(
        org_id, user_id, txn.id,
        proposed_applicant_id=applicant.id,
        proposed_property_id=prop.id,
    )
    db.add_all([applicant, prop, txn, review])
    await db.flush()

    receipt_mock = AsyncMock()
    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        receipt_mock,
    ):
        await confirm_review(
            review_id=review.id, organization_id=org_id, user_id=user_id,
        )

    refreshed_txn = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed_txn.applicant_id == applicant.id
    assert refreshed_txn.attribution_source == "auto_fuzzy_confirmed"
    receipt_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_no_applicant_or_property_raises(db: AsyncSession):
    """A row with neither proposed target and no override args raises."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    txn = _txn(org_id, user_id)
    review = _review(org_id, user_id, txn.id)
    db.add_all([txn, review])
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        with pytest.raises(ValueError, match="No applicant or property specified"):
            await confirm_review(
                review_id=review.id, organization_id=org_id, user_id=user_id,
            )
