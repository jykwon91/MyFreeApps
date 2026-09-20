"""Resolve the listing a tenant occupies.

A tenant's listing is the hinge between a person and a property: rent
attribution stamps ``transaction.property_id`` through it, and a rent receipt
prints the property address from it.

The signed lease carries ``listing_id``, but it is optional on both creation
paths (generate and import), so a lease can exist without one. When it does,
the applicant's originating inquiry still knows which listing they answered —
that is the fallback used here, and it is what lease creation now defaults to
so the gap stops being reintroduced.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.repositories.applicants import applicant_repo
from app.repositories.inquiries import inquiry_repo
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
    """Return the listing the applicant's inquiry came in through, or ``None``."""
    if applicant.inquiry_id is None:
        return None
    inquiry = await inquiry_repo.get_by_id(db, applicant.inquiry_id, organization_id)
    if inquiry is None:
        return None
    return inquiry.listing_id


async def default_listing_id(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID | None,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> uuid.UUID | None:
    """Return ``listing_id``, or the applicant's inquiry listing when omitted.

    Both lease-creation paths take ``listing_id`` optionally, and the UI does
    not always send one. Defaulting it here keeps the tenant→property chain
    intact for rent attribution and receipts.
    """
    if listing_id is not None:
        return listing_id
    applicant = await applicant_repo.get(
        db,
        applicant_id=applicant_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    if applicant is None:
        return None
    return await resolve_inquiry_listing_id(
        db, applicant=applicant, organization_id=organization_id,
    )
