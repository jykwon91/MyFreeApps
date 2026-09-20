"""Tests for tenant→listing resolution.

The regression these guard: a signed lease may carry no ``listing_id`` (it is
optional on both creation paths), which used to break the walk to the tenant's
property. Every auto-attributed payment for such a tenant landed with
``property_id = NULL`` and showed up under the dashboard's "Unassigned" bucket
instead of the property they actually rent.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.leases.signed_lease import SignedLease
from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.services.leases.listing_resolution import (
    default_listing_id,
    resolve_listing_id_for_applicant,
)
from app.services.transactions.attribution_helpers import (
    _get_property_id_for_applicant,
)


def _make_listing(*, org_id: uuid.UUID, user_id: uuid.UUID, property_id: uuid.UUID) -> Listing:
    return Listing(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        title="Private suite",
        monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        status="active",
        amenities=[],
    )


async def _seed(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    lease_has_listing: bool,
    applicant_has_inquiry: bool = True,
) -> tuple[Applicant, Listing]:
    """Seed a lease_signed applicant whose inquiry points at a listing."""
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="6734 Peerless")
    db.add(prop)
    await db.flush()
    listing = _make_listing(org_id=org_id, user_id=user_id, property_id=prop.id)
    db.add(listing)
    await db.flush()

    inquiry_id = None
    if applicant_has_inquiry:
        inquiry = Inquiry(
            id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
            source="direct", stage="new", listing_id=listing.id,
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inquiry)
        await db.flush()
        inquiry_id = inquiry.id

    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        stage="lease_signed", legal_name="Andrew Le", inquiry_id=inquiry_id,
    )
    db.add(applicant)
    await db.flush()

    lease = SignedLease(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        applicant_id=applicant.id,
        listing_id=listing.id if lease_has_listing else None,
        kind="imported", status="signed", values={},
    )
    db.add(lease)
    await db.flush()
    return applicant, listing


@pytest.mark.asyncio
async def test_prefers_the_listing_on_the_signed_lease(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=True,
    )

    resolved = await resolve_listing_id_for_applicant(db, applicant, test_org.id)

    assert resolved == listing.id


@pytest.mark.asyncio
async def test_falls_back_to_the_inquiry_listing_when_the_lease_has_none(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )

    resolved = await resolve_listing_id_for_applicant(db, applicant, test_org.id)

    assert resolved == listing.id


@pytest.mark.asyncio
async def test_returns_none_when_neither_lease_nor_inquiry_has_a_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, _ = await _seed(
        db, org_id=test_org.id, user_id=test_user.id,
        lease_has_listing=False, applicant_has_inquiry=False,
    )

    resolved = await resolve_listing_id_for_applicant(db, applicant, test_org.id)

    assert resolved is None


@pytest.mark.asyncio
async def test_attribution_resolves_the_property_through_the_inquiry_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    # The dashboard regression: without the fallback this returned None and the
    # payment was saved with no property.
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )

    property_id = await _get_property_id_for_applicant(db, applicant, test_org.id)

    assert property_id == listing.property_id


@pytest.mark.asyncio
async def test_default_listing_id_keeps_an_explicitly_chosen_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, _ = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )
    chosen = uuid.uuid4()

    resolved = await default_listing_id(
        db,
        listing_id=chosen,
        applicant_id=applicant.id,
        organization_id=test_org.id,
        user_id=test_user.id,
    )

    assert resolved == chosen


@pytest.mark.asyncio
async def test_default_listing_id_falls_back_to_the_inquiry_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )

    resolved = await default_listing_id(
        db,
        listing_id=None,
        applicant_id=applicant.id,
        organization_id=test_org.id,
        user_id=test_user.id,
    )

    assert resolved == listing.id
