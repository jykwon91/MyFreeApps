"""Resolve the property address printed on a rent receipt.

Split out of ``receipt_service`` so that module stays under the file-size
growth guard. The walk is applicant → signed_lease → listing → property, with
the tenant's originating inquiry standing in when a lease carries no
``listing_id`` (see ``listing_resolution``).
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.applicants import applicant_repo
from app.repositories.leases import signed_lease_repo
from app.repositories.listings import listing_repo
from app.repositories.properties import property_repo
from app.services.leases.listing_resolution import resolve_inquiry_listing_id

ADDRESS_FALLBACK = "Address on file"


async def resolve_property_address(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[str, uuid.UUID | None]:
    """Walk applicant → signed_lease → listing → property to get the address.

    Returns ``(address_string, signed_lease_id)``.  The address is best-effort
    — if the chain is broken at any point, a fallback string is returned.

    A lease carrying no ``listing_id`` falls back to the listing the tenant's
    inquiry came in through, so the receipt still prints the real address
    instead of "Address on file".
    """
    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        include_deleted=False,
        limit=5,
    )
    lease_id = leases[0].id if leases else None
    for lease in leases:
        if not lease.listing_id:
            continue
        address = await property_address_for_listing(
            db, listing_id=lease.listing_id, organization_id=organization_id,
        )
        if address:
            return address, lease.id

    applicant = await applicant_repo.get(
        db,
        applicant_id=applicant_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    if applicant is not None:
        listing_id = await resolve_inquiry_listing_id(
            db, applicant=applicant, organization_id=organization_id,
        )
        if listing_id is not None:
            address = await property_address_for_listing(
                db, listing_id=listing_id, organization_id=organization_id,
            )
            if address:
                return address, lease_id
    return ADDRESS_FALLBACK, lease_id


async def property_address_for_listing(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> str | None:
    """Return the address of the property behind a listing, if both resolve."""
    listing = await listing_repo.get_by_id(db, listing_id, organization_id)
    if listing is None or not listing.property_id:
        return None
    prop = await property_repo.get_by_id(
        db, listing.property_id, organization_id=organization_id
    )
    if prop is None or not prop.address:
        return None
    return prop.address
