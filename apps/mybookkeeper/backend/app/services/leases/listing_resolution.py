"""Resolve the listing and the house (property) a tenant occupies.

A tenant's lease is the hinge between a person and a property: rent
attribution stamps ``transaction.property_id`` through it, and a rent receipt
prints the property address from it.

The lease records its house in ``property_id``. Older leases may lack it, and
a lease's ``listing_id`` is optional on both creation paths, so the walk falls
back to the lease's listing and then to the listing the applicant's
originating inquiry came in through.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.listings.listing import Listing
from app.repositories.inquiries import inquiry_repo
from app.repositories.listings import listing_repo
from app.repositories.leases import signed_lease_repo

# How many of the tenant's newest leases the walk looks through.
_LEASES_SCANNED = 5


async def resolve_property_id_for_applicant(
    db: AsyncSession,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
    """Return the house this applicant rents, or ``None``.

    Newest lease first: its own ``property_id``, else its listing's property.
    Then the property of the listing their inquiry came in through.
    """
    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=applicant.user_id,
        organization_id=organization_id,
        applicant_id=applicant.id,
        include_deleted=False,
        limit=_LEASES_SCANNED,
    )
    for lease in leases:
        if lease.property_id:
            return lease.property_id
        if lease.listing_id:
            listing = await listing_repo.get_by_id(
                db, lease.listing_id, organization_id, include_deleted=True,
            )
            if listing is not None:
                return listing.property_id

    listing = await resolve_inquiry_listing(
        db, applicant=applicant, organization_id=organization_id,
    )
    return listing.property_id if listing is not None else None


async def resolve_inquiry_listing(
    db: AsyncSession,
    *,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> Listing | None:
    """Return the listing the applicant's inquiry came in through, or ``None``.

    The inquiry's listing must belong to the same organization. Inquiries used
    to accept any ``listing_id``, so an old row may still point at another
    tenant's listing; following it would put that listing on a new lease.
    A soft-deleted listing of the organization is still returned — the link
    is real, and rent attribution reads the property through it.
    """
    if applicant.inquiry_id is None:
        return None
    inquiry = await inquiry_repo.get_by_id(db, applicant.inquiry_id, organization_id)
    if inquiry is None or inquiry.listing_id is None:
        return None
    return await listing_repo.get_by_id(
        db, inquiry.listing_id, organization_id, include_deleted=True,
    )


async def resolve_inquiry_listing_id(
    db: AsyncSession,
    *,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
    """The id of ``resolve_inquiry_listing``'s listing, or ``None``."""
    listing = await resolve_inquiry_listing(
        db, applicant=applicant, organization_id=organization_id,
    )
    return listing.id if listing is not None else None
