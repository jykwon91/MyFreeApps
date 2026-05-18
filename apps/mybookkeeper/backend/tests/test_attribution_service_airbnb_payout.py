"""Integration tests for the Airbnb-payout wiring in
``attribution_service._attribute_airbnb_payout``.

The exhaustive cascade matrix lives in ``test_airbnb_payout_matcher.py``
(pure). These tests verify the orchestration: parse_res_code(txn.description)
→ booking_statement lookup → decide → act (mutate txn for auto, create a
review row with proposed_property_id for propose, unmatched otherwise).

The Airbnb path does not open its own unit_of_work (writes flush into the
caller's session), so no uow patching is needed. ``list_by_channel`` (a
Channel/ChannelListing join — infra, not under test) is patched at the repo
boundary; ``find_by_res_code`` runs for real against seeded rows.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.services.transactions.attribution_service import maybe_attribute_payment


def _property(org_id: uuid.UUID, user_id: uuid.UUID, name: str = "Beach House") -> Property:
    return Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name=name)


def _txn(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    description: str | None = None,
    address: str | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        transaction_date=_dt.date(2026, 5, 1),
        tax_year=2026,
        amount="850.00",
        transaction_type="income",
        category="uncategorized",
        status="approved",
        is_manual=False,
        description=description,
        address=address,
    )


def _booking_statement(
    org_id: uuid.UUID, res_code: str, property_id: uuid.UUID | None
) -> BookingStatement:
    return BookingStatement(
        id=uuid.uuid4(),
        organization_id=org_id,
        property_id=property_id,
        res_code=res_code,
        check_in=_dt.date(2026, 4, 20),
        check_out=_dt.date(2026, 4, 25),
    )


def _fake_listing(title: str, property_id: uuid.UUID | None) -> MagicMock:
    listing = MagicMock()
    listing.title = title
    listing.property_id = property_id
    return listing


def _patch_listings(listings: list) -> object:
    return patch(
        "app.services.transactions.attribution_service.listing_repo.list_by_channel",
        new_callable=AsyncMock,
        return_value=listings,
    )


async def _review_for(db: AsyncSession, txn_id: uuid.UUID) -> RentAttributionReviewQueue | None:
    return (
        await db.execute(
            select(RentAttributionReviewQueue).where(
                RentAttributionReviewQueue.transaction_id == txn_id
            )
        )
    ).scalar_one_or_none()


@pytest.mark.asyncio
async def test_res_code_resolves_property_auto(db: AsyncSession):
    """res_code in description → BookingStatement → property: auto-attributed,
    no review row."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = _property(org_id, user_id)
    stmt = _booking_statement(org_id, "HM12345", prop.id)
    txn = _txn(org_id, user_id, description="Payout for reservation HM12345")
    db.add_all([prop, stmt, txn])
    await db.flush()

    with _patch_listings([]):
        await maybe_attribute_payment(
            db,
            txn=txn,
            payer_name=None,
            organization_id=org_id,
            user_id=user_id,
            is_airbnb_payout=True,
        )

    refreshed = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed.property_id == prop.id
    assert refreshed.attribution_source == "auto_exact"
    assert refreshed.category == "rental_revenue"
    assert await _review_for(db, txn.id) is None


@pytest.mark.asyncio
async def test_title_in_description_proposes_property(db: AsyncSession):
    """No res_code, ≥2 listings, one title in the payout text → review row
    with proposed_property_id + confidence 'fuzzy'; txn left untouched."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop_a, prop_b = uuid.uuid4(), uuid.uuid4()
    txn = _txn(org_id, user_id, description="Airbnb payout for Lakeside Cabin")
    db.add(txn)
    await db.flush()

    listings = [_fake_listing("Lakeside Cabin", prop_a), _fake_listing("City Loft", prop_b)]
    with _patch_listings(listings):
        await maybe_attribute_payment(
            db,
            txn=txn,
            payer_name=None,
            organization_id=org_id,
            user_id=user_id,
            is_airbnb_payout=True,
        )

    refreshed = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed.property_id is None
    assert refreshed.attribution_source is None

    review = await _review_for(db, txn.id)
    assert review is not None
    assert review.proposed_property_id == prop_a
    assert review.proposed_applicant_id is None
    assert review.confidence == "fuzzy"
    assert review.status == "pending"


@pytest.mark.asyncio
async def test_no_signal_queues_unmatched(db: AsyncSession):
    """No res_code, no listings → unmatched review row, no proposal."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    txn = _txn(org_id, user_id, description="Airbnb payout deposited")
    db.add(txn)
    await db.flush()

    with _patch_listings([]):
        await maybe_attribute_payment(
            db,
            txn=txn,
            payer_name=None,
            organization_id=org_id,
            user_id=user_id,
            is_airbnb_payout=True,
        )

    review = await _review_for(db, txn.id)
    assert review is not None
    assert review.confidence == "unmatched"
    assert review.proposed_property_id is None
    refreshed = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed.property_id is None


@pytest.mark.asyncio
async def test_res_code_without_statement_falls_through_to_unmatched(db: AsyncSession):
    """A parseable code with no matching BookingStatement and no listings →
    unmatched (does not crash, does not auto-attribute)."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    txn = _txn(org_id, user_id, description="Payout for reservation HM99999")
    db.add(txn)
    await db.flush()

    with _patch_listings([]):
        await maybe_attribute_payment(
            db,
            txn=txn,
            payer_name=None,
            organization_id=org_id,
            user_id=user_id,
            is_airbnb_payout=True,
        )

    review = await _review_for(db, txn.id)
    assert review is not None
    assert review.confidence == "unmatched"


@pytest.mark.asyncio
async def test_res_code_statement_without_property_falls_through(db: AsyncSession):
    """A BookingStatement exists for the res_code but its property_id is NULL
    (FK SET NULL after property delete) → fall through, never auto with no
    property; with no listings → unmatched."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    stmt = _booking_statement(org_id, "HM55555", property_id=None)
    txn = _txn(org_id, user_id, description="Payout for reservation HM55555")
    db.add_all([stmt, txn])
    await db.flush()

    with _patch_listings([]):
        await maybe_attribute_payment(
            db,
            txn=txn,
            payer_name=None,
            organization_id=org_id,
            user_id=user_id,
            is_airbnb_payout=True,
        )

    refreshed = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed.property_id is None
    assert refreshed.attribution_source is None
    review = await _review_for(db, txn.id)
    assert review is not None
    assert review.confidence == "unmatched"
    assert review.proposed_property_id is None


@pytest.mark.asyncio
async def test_res_code_outranks_single_listing(db: AsyncSession):
    """Regression: res_code-resolved property wins over a lone Airbnb
    listing pointing elsewhere (architecture Finding 2)."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    res_prop = _property(org_id, user_id, "Res Code Property")
    other_prop_id = uuid.uuid4()
    stmt = _booking_statement(org_id, "HMRESCODE1", res_prop.id)
    txn = _txn(org_id, user_id, description="payout reservation HMRESCODE1")
    db.add_all([res_prop, stmt, txn])
    await db.flush()

    with _patch_listings([_fake_listing("Some Other Place", other_prop_id)]):
        await maybe_attribute_payment(
            db,
            txn=txn,
            payer_name=None,
            organization_id=org_id,
            user_id=user_id,
            is_airbnb_payout=True,
        )

    refreshed = (
        await db.execute(select(Transaction).where(Transaction.id == txn.id))
    ).scalar_one()
    assert refreshed.property_id == res_prop.id
    assert refreshed.attribution_source == "auto_exact"
    assert await _review_for(db, txn.id) is None
