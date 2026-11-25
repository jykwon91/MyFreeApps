"""Check the applicant, listing and house a lease names, and default them.

Both lease-creation paths (generate from templates, import signed PDFs) take
``applicant_id`` and optional ``listing_id`` / ``property_id`` straight from
the client. The foreign keys only prove those rows exist somewhere, so each id
is checked against the caller before the lease is written — otherwise a lease
could hang off another tenant's applicant, listing or house, and the calendar,
receipts and rent attribution would then read that tenant's data through it.

The house is what rent attribution files the tenant's payments under, so it is
always defaulted when not sent: from the chosen listing, else from the listing
the applicant's inquiry came in through.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease import SignedLease
from app.repositories.applicants import applicant_repo
from app.repositories.listings import listing_repo
from app.services.leases._lease_helpers import (
    ApplicantNotFoundError,
    ListingNotFoundError,
)
from app.services.leases.exceptions.lease_property_not_found_error import (
    LeasePropertyNotFoundError,
)
from app.services.leases.exceptions.listing_property_mismatch_error import (
    ListingPropertyMismatchError,
)
from app.services.leases.listing_resolution import resolve_inquiry_listing
from app.services.leases.resolved_lease_references import ResolvedLeaseReferences
from app.services.properties.property_ownership import owns_property


async def resolve_lease_references(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    listing_id: uuid.UUID | None,
    property_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResolvedLeaseReferences:
    """Return the listing and house the new lease should carry.

    Raises ``ApplicantNotFoundError`` when the applicant is not the caller's,
    ``ListingNotFoundError`` when an explicit listing is not one of the
    organization's live listings, ``LeasePropertyNotFoundError`` when an
    explicit house is not one of the organization's, and
    ``ListingPropertyMismatchError`` when both are sent and disagree.

    The inquiry's listing is only carried over when it agrees with the house:
    a host who picked another house is correcting the inquiry, not the lease.
    """
    applicant = await applicant_repo.get(
        db,
        applicant_id=applicant_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    if applicant is None:
        raise ApplicantNotFoundError(f"Applicant {applicant_id} not found")

    if property_id is not None:
        await ensure_owns_property(db, organization_id=organization_id, property_id=property_id)

    if listing_id is not None:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        if property_id is not None and listing.property_id != property_id:
            raise ListingPropertyMismatchError(
                f"Listing {listing_id} is not for property {property_id}",
            )
        return ResolvedLeaseReferences(listing_id=listing.id, property_id=listing.property_id)

    inquiry_listing = await resolve_inquiry_listing(
        db, applicant=applicant, organization_id=organization_id,
    )
    if inquiry_listing is None:
        return ResolvedLeaseReferences(listing_id=None, property_id=property_id)
    if property_id is not None and inquiry_listing.property_id != property_id:
        return ResolvedLeaseReferences(listing_id=None, property_id=property_id)
    return ResolvedLeaseReferences(
        listing_id=inquiry_listing.id, property_id=inquiry_listing.property_id,
    )


async def property_change_fields(
    db: AsyncSession,
    *,
    lease: SignedLease,
    property_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> dict[str, Any]:
    """The column updates that move an existing lease to another house.

    The house is the source of truth for rent attribution. If the lease's
    listing is for a different house, that link is what was wrong, so it is
    cleared rather than left contradicting the house the host just chose.
    """
    await ensure_owns_property(db, organization_id=organization_id, property_id=property_id)
    fields: dict[str, Any] = {"property_id": property_id}
    if lease.listing_id is not None:
        listing = await listing_repo.get_by_id(
            db, lease.listing_id, organization_id, include_deleted=True,
        )
        if listing is None or listing.property_id != property_id:
            fields["listing_id"] = None
    return fields


async def ensure_owns_property(
    db: AsyncSession, *, organization_id: uuid.UUID, property_id: uuid.UUID,
) -> None:
    if not await owns_property(db, organization_id=organization_id, property_id=property_id):
        raise LeasePropertyNotFoundError(f"Property {property_id} not found")
