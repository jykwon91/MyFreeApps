"""Tests for tenant→house resolution.

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
from app.services.leases.listing_resolution import resolve_property_id_for_applicant
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
    lease_property_id: uuid.UUID | None = None,
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
        property_id=lease_property_id,
        kind="imported", status="signed", values={},
    )
    db.add(lease)
    await db.flush()
    return applicant, listing


@pytest.mark.asyncio
async def test_uses_the_listing_on_the_signed_lease(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=True,
    )

    resolved = await resolve_property_id_for_applicant(db, applicant, test_org.id)

    assert resolved == listing.property_id


@pytest.mark.asyncio
async def test_falls_back_to_the_inquiry_listing_when_the_lease_has_none(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )

    resolved = await resolve_property_id_for_applicant(db, applicant, test_org.id)

    assert resolved == listing.property_id


@pytest.mark.asyncio
async def test_returns_none_when_neither_lease_nor_inquiry_has_a_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, _ = await _seed(
        db, org_id=test_org.id, user_id=test_user.id,
        lease_has_listing=False, applicant_has_inquiry=False,
    )

    resolved = await resolve_property_id_for_applicant(db, applicant, test_org.id)

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
async def test_ignores_an_inquiry_listing_from_another_organization(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    # Inquiries used to accept any listing_id. An old row pointing at another
    # tenant's listing must not hand that listing to this tenant's lease.
    applicant, _ = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )
    other_org_id = uuid.uuid4()
    other_prop = Property(
        id=uuid.uuid4(), organization_id=other_org_id, user_id=uuid.uuid4(), name="Elsewhere",
    )
    db.add(other_prop)
    await db.flush()
    foreign = _make_listing(org_id=other_org_id, user_id=other_prop.user_id, property_id=other_prop.id)
    db.add(foreign)
    await db.flush()
    inquiry = await db.get(Inquiry, applicant.inquiry_id)
    assert inquiry is not None
    inquiry.listing_id = foreign.id
    await db.flush()

    resolved = await resolve_property_id_for_applicant(db, applicant, test_org.id)

    assert resolved is None


@pytest.mark.asyncio
async def test_keeps_a_soft_deleted_inquiry_listing_of_the_same_organization(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id, lease_has_listing=False,
    )
    listing.deleted_at = _dt.datetime.now(_dt.timezone.utc)
    await db.flush()

    resolved = await resolve_property_id_for_applicant(db, applicant, test_org.id)

    assert resolved == listing.property_id


async def _other_house(db: AsyncSession, *, org_id: uuid.UUID, user_id: uuid.UUID) -> Property:
    """A second house of the same owner, with no listing at all."""
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="12 Elm")
    db.add(prop)
    await db.flush()
    return prop


@pytest.mark.asyncio
async def test_prefers_the_house_the_lease_records_over_its_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    house = await _other_house(db, org_id=test_org.id, user_id=test_user.id)
    applicant, listing = await _seed(
        db, org_id=test_org.id, user_id=test_user.id,
        lease_has_listing=True, lease_property_id=house.id,
    )

    property_id = await _get_property_id_for_applicant(db, applicant, test_org.id)

    assert property_id == house.id
    assert property_id != listing.property_id


@pytest.mark.asyncio
async def test_ties_a_tenant_to_a_house_with_no_listing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    house = await _other_house(db, org_id=test_org.id, user_id=test_user.id)
    applicant, _ = await _seed(
        db, org_id=test_org.id, user_id=test_user.id,
        lease_has_listing=False, applicant_has_inquiry=False, lease_property_id=house.id,
    )

    property_id = await _get_property_id_for_applicant(db, applicant, test_org.id)

    assert property_id == house.id
