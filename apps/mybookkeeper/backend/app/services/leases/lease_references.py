"""Check the applicant and listing a new lease names, and default the listing.

Both lease-creation paths (generate from templates, import signed PDFs) take
``applicant_id`` and an optional ``listing_id`` straight from the client. The
foreign keys only prove those rows exist somewhere, so each id is checked
against the caller before the lease is written — otherwise a lease could hang
off another tenant's applicant or listing, and the calendar, receipts and rent
attribution would then read that tenant's names and addresses through it.

When no listing is sent, the applicant's inquiry listing is used so the
tenant→property chain stays intact for rent attribution and receipts.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.applicants import applicant_repo
from app.services.leases._lease_helpers import (
    ApplicantNotFoundError,
    ListingNotFoundError,
)
from app.services.leases.listing_resolution import resolve_inquiry_listing_id
from app.services.listings.listing_ownership import owns_listing


async def resolve_lease_listing_id(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    listing_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> uuid.UUID | None:
    """Return the listing the new lease should carry.

    Raises ``ApplicantNotFoundError`` when the applicant is not the caller's,
    and ``ListingNotFoundError`` when an explicit listing is not one of the
    organization's live listings.
    """
    applicant = await applicant_repo.get(
        db,
        applicant_id=applicant_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    if applicant is None:
        raise ApplicantNotFoundError(f"Applicant {applicant_id} not found")

    if listing_id is not None:
        if not await owns_listing(
            db, organization_id=organization_id, listing_id=listing_id,
        ):
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        return listing_id

    return await resolve_inquiry_listing_id(
        db, applicant=applicant, organization_id=organization_id,
    )
