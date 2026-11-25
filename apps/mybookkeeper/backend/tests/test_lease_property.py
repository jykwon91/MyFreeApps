"""Every lease records its house (``signed_leases.property_id``).

Rent attribution reads the lease's house first, so the house must be set on
both creation paths, checked against the organization, kept consistent with
the listing, and changeable on an existing lease at any status. These drive
the real service (and the real routes) against the in-memory database.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.lease_property_constants import LISTING_PROPERTY_MISMATCH_CODE
from app.core.permissions import require_write_access
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.leases.signed_lease import SignedLease
from app.models.listings.listing import Listing
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property
from app.repositories.leases import lease_template_repo
from app.services.leases import lease_lifecycle_service
from app.services.leases.exceptions.lease_property_not_found_error import (
    LeasePropertyNotFoundError,
)
from app.services.leases.exceptions.listing_property_mismatch_error import (
    ListingPropertyMismatchError,
)
from app.services.leases.lease_references import resolve_lease_references

ORG = uuid.uuid4()
USER = uuid.uuid4()
OTHER_ORG = uuid.uuid4()
OTHER_USER = uuid.uuid4()


async def _house(db: AsyncSession, *, org_id: uuid.UUID = ORG, user_id: uuid.UUID = USER) -> Property:
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="House")
    db.add(prop)
    await db.flush()
    return prop


async def _listing(db: AsyncSession, house: Property) -> Listing:
    listing = Listing(
        id=uuid.uuid4(), organization_id=house.organization_id, user_id=house.user_id,
        property_id=house.id, title="Room", monthly_rate=Decimal("1000.00"),
        room_type="private_room", status="active", amenities=[],
    )
    db.add(listing)
    await db.flush()
    return listing


async def _applicant(db: AsyncSession, *, inquiry_listing: Listing | None = None) -> Applicant:
    inquiry_id = None
    if inquiry_listing is not None:
        inquiry = Inquiry(
            id=uuid.uuid4(), organization_id=ORG, user_id=USER, source="direct",
            stage="new", listing_id=inquiry_listing.id,
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inquiry)
        await db.flush()
        inquiry_id = inquiry.id
    applicant = Applicant(
        organization_id=ORG, user_id=USER, stage="approved", legal_name="Tenant", inquiry_id=inquiry_id,
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def _resolve(
    db: AsyncSession, applicant: Applicant, *,
    listing_id: uuid.UUID | None = None, property_id: uuid.UUID | None = None,
):
    return await resolve_lease_references(
        db, applicant_id=applicant.id, listing_id=listing_id, property_id=property_id,
        organization_id=ORG, user_id=USER,
    )


# ---------------------------------------------------------------------------
# Defaults on create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_explicit_house_is_kept(db: AsyncSession) -> None:
    house = await _house(db)
    applicant = await _applicant(db)

    resolved = await _resolve(db, applicant, property_id=house.id)

    assert (resolved.listing_id, resolved.property_id) == (None, house.id)


@pytest.mark.asyncio
async def test_the_house_defaults_from_the_chosen_listing(db: AsyncSession) -> None:
    listing = await _listing(db, await _house(db))
    applicant = await _applicant(db)

    resolved = await _resolve(db, applicant, listing_id=listing.id)

    assert (resolved.listing_id, resolved.property_id) == (listing.id, listing.property_id)


@pytest.mark.asyncio
async def test_the_house_defaults_from_the_inquiry_listing(db: AsyncSession) -> None:
    listing = await _listing(db, await _house(db))
    applicant = await _applicant(db, inquiry_listing=listing)

    resolved = await _resolve(db, applicant)

    assert (resolved.listing_id, resolved.property_id) == (listing.id, listing.property_id)


@pytest.mark.asyncio
async def test_no_listing_anywhere_leaves_no_house(db: AsyncSession) -> None:
    applicant = await _applicant(db)

    resolved = await _resolve(db, applicant)

    assert (resolved.listing_id, resolved.property_id) == (None, None)


@pytest.mark.asyncio
async def test_a_house_other_than_the_inquiry_listings_drops_that_listing(db: AsyncSession) -> None:
    listing = await _listing(db, await _house(db))
    other = await _house(db)
    applicant = await _applicant(db, inquiry_listing=listing)

    resolved = await _resolve(db, applicant, property_id=other.id)

    assert (resolved.listing_id, resolved.property_id) == (None, other.id)


@pytest.mark.asyncio
async def test_a_listing_for_another_house_is_refused(db: AsyncSession) -> None:
    listing = await _listing(db, await _house(db))
    other = await _house(db)
    applicant = await _applicant(db)

    with pytest.raises(ListingPropertyMismatchError):
        await _resolve(db, applicant, listing_id=listing.id, property_id=other.id)


@pytest.mark.asyncio
async def test_a_house_of_another_organization_is_refused(db: AsyncSession) -> None:
    foreign = await _house(db, org_id=OTHER_ORG, user_id=OTHER_USER)
    applicant = await _applicant(db)

    with pytest.raises(LeasePropertyNotFoundError):
        await _resolve(db, applicant, property_id=foreign.id)


# ---------------------------------------------------------------------------
# Routes, real service
# ---------------------------------------------------------------------------


@pytest.fixture
def client(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    @asynccontextmanager
    async def _uow():
        yield db

    monkeypatch.setattr(lease_lifecycle_service, "unit_of_work", _uow)
    app.dependency_overrides[require_write_access] = lambda: RequestContext(
        organization_id=ORG, user_id=USER, org_role=OrgRole.OWNER,
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


async def _template_id(db: AsyncSession) -> uuid.UUID:
    template = await lease_template_repo.create(db, user_id=USER, organization_id=ORG, name="Master")
    return template.id


async def _lease(db: AsyncSession, applicant: Applicant, *, status: str, listing: Listing | None) -> SignedLease:
    lease = SignedLease(
        id=uuid.uuid4(), organization_id=ORG, user_id=USER, applicant_id=applicant.id,
        listing_id=listing.id if listing else None,
        property_id=listing.property_id if listing else None,
        kind="imported", status=status, values={},
    )
    db.add(lease)
    await db.flush()
    return lease


@pytest.mark.asyncio
async def test_create_records_the_house_sent(db: AsyncSession, client: TestClient) -> None:
    template_id = await _template_id(db)
    house = await _house(db)
    applicant = await _applicant(db)

    resp = client.post("/signed-leases", json={
        "template_ids": [str(template_id)], "applicant_id": str(applicant.id), "property_id": str(house.id),
    })

    assert resp.status_code == 201, resp.text
    assert resp.json()["property_id"] == str(house.id)


@pytest.mark.asyncio
async def test_create_refuses_a_listing_for_another_house(db: AsyncSession, client: TestClient) -> None:
    template_id = await _template_id(db)
    listing = await _listing(db, await _house(db))
    other = await _house(db)
    applicant = await _applicant(db)

    resp = client.post("/signed-leases", json={
        "template_ids": [str(template_id)], "applicant_id": str(applicant.id),
        "listing_id": str(listing.id), "property_id": str(other.id),
    })

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == LISTING_PROPERTY_MISMATCH_CODE


@pytest.mark.asyncio
async def test_create_refuses_a_house_of_another_organization(db: AsyncSession, client: TestClient) -> None:
    template_id = await _template_id(db)
    foreign = await _house(db, org_id=OTHER_ORG, user_id=OTHER_USER)
    applicant = await _applicant(db)

    resp = client.post("/signed-leases", json={
        "template_ids": [str(template_id)], "applicant_id": str(applicant.id), "property_id": str(foreign.id),
    })

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Property not found"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["draft", "signed", "active", "ended"])
async def test_patch_moves_a_lease_of_any_status_and_clears_a_listing_for_another_house(
    db: AsyncSession, client: TestClient, status: str,
) -> None:
    listing = await _listing(db, await _house(db))
    other = await _house(db)
    lease = await _lease(db, await _applicant(db), status=status, listing=listing)

    resp = client.patch(f"/signed-leases/{lease.id}", json={"property_id": str(other.id)})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["property_id"], body["listing_id"], body["status"]) == (str(other.id), None, status)


@pytest.mark.asyncio
async def test_patch_keeps_a_listing_for_the_same_house(db: AsyncSession, client: TestClient) -> None:
    listing = await _listing(db, await _house(db))
    lease = await _lease(db, await _applicant(db), status="active", listing=None)

    resp = client.patch(f"/signed-leases/{lease.id}", json={"property_id": str(listing.property_id)})
    assert resp.status_code == 200, resp.text
    assert resp.json()["property_id"] == str(listing.property_id)

    lease.listing_id = listing.id
    await db.flush()
    resp = client.patch(f"/signed-leases/{lease.id}", json={"property_id": str(listing.property_id)})
    assert resp.json()["listing_id"] == str(listing.id)


@pytest.mark.asyncio
async def test_patch_refuses_a_house_of_another_organization(db: AsyncSession, client: TestClient) -> None:
    foreign = await _house(db, org_id=OTHER_ORG, user_id=OTHER_USER)
    lease = await _lease(db, await _applicant(db), status="signed", listing=None)

    resp = client.patch(f"/signed-leases/{lease.id}", json={"property_id": str(foreign.id)})

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Property not found"
    assert lease.property_id is None
