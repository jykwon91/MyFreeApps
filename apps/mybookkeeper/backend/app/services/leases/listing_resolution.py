"""Resolve the listing a tenant occupies.

A tenant's listing is the hinge between a person and a property: rent
attribution stamps ``transaction.property_id`` through it, and a rent receipt
prints the property address from it.

The signed lease carries ``listing_id``, but it is optional on both creation
paths (generate and import), so a lease can exist without one. When it does,
the applicant's originating inquiry still knows which listing they answered —
that is the fallback used here, and it is what lease creation now defaults to
so the gap stops being reintroduced (``lease_references``).
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.repositories.inquiries import inquiry_repo
from app.repositories.listings import listing_repo
from app.repositories.leases import signed_lease_repo


async def resolve_listing_id_for_applicant(
    db: AsyncSession,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
    """Return the listing this applicant occupies, or ``None``.

    Prefers a signed lease's ``listing_id``; falls back to the listing their
    inquiry came in through.
    """
    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=applicant.user_id,
        organization_id=organization_id,
        applicant_id=applicant.id,
        include_deleted=False,
        limit=5,
    )
    for lease in leases:
        if lease.listing_id:
            return lease.listing_id

    return await resolve_inquiry_listing_id(
        db, applicant=applicant, organization_id=organization_id,
    )


async def resolve_inquiry_listing_id(
    db: AsyncSession,
    *,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
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
    listing = await listing_repo.get_by_id(
        db, inquiry.listing_id, organization_id, include_deleted=True,
    )
    return listing.id if listing is not None else None

