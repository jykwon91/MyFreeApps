"""Repository for the unified calendar viewer.

One query joins ``listing_blackouts`` → ``listings`` → ``properties`` and
returns the rows the viewer needs (per-event listing name + property name)
in a single round trip. Tenant-scoped via ``listings.organization_id`` —
the blackout itself has no tenant column, so isolation must be enforced
on the listing's organization.

Date overlap semantics: an event is in the window when
``starts_on < window_to AND ends_on > window_from`` — this is the
half-open interval intersection, consistent with the iCal exclusive-end
convention used by ``ListingBlackout``.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.properties.property import Property


async def query_events(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    from_: date,
    to: date,
    listing_ids: Sequence[uuid.UUID] | None = None,
    property_ids: Sequence[uuid.UUID] | None = None,
    sources: Sequence[str] | None = None,
) -> list[tuple[ListingBlackout, Listing, Property]]:
    """Return blackouts + their parent listing + property within ``[from_, to)``.

    Filters compose with AND across categories and OR within a category:
    ``listing_ids`` narrows to specific listings; ``property_ids`` narrows to
    listings under specific properties; ``sources`` narrows by channel slug.
    Empty filter list is treated as "no filter on this dimension".

    Soft-deleted listings (``deleted_at IS NOT NULL``) are excluded.
    """
    stmt = (
        select(ListingBlackout, Listing, Property)
        .join(Listing, Listing.id == ListingBlackout.listing_id)
        .join(Property, Property.id == Listing.property_id)
        .where(
            # Tenant scope — the blackout has no organization column, so we
            # enforce on the parent listing.
            Listing.organization_id == organization_id,
            Listing.deleted_at.is_(None),
            # Half-open interval intersection — see module docstring.
            ListingBlackout.starts_on < to,
            ListingBlackout.ends_on > from_,
        )
        .order_by(
            Property.name.asc(),
            Listing.title.asc(),
            ListingBlackout.starts_on.asc(),
            ListingBlackout.id.asc(),
        )
    )

    if listing_ids:
        stmt = stmt.where(ListingBlackout.listing_id.in_(list(listing_ids)))
    if property_ids:
        stmt = stmt.where(Listing.property_id.in_(list(property_ids)))
    if sources:
        stmt = stmt.where(ListingBlackout.source.in_(list(sources)))

    result = await db.execute(stmt)
    return [(blackout, listing, prop) for blackout, listing, prop in result.all()]
