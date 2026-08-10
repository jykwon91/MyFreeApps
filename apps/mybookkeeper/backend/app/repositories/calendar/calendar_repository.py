"""Repository for the unified calendar viewer.

Two queries feed the viewer, one per event source:

``query_events`` joins ``listing_blackouts`` → ``listings`` → ``properties``
— channel bookings and manual blocks. ``query_lease_events`` joins
``signed_leases`` → ``listings`` → ``properties`` → ``applicants`` — tenant
occupancy. Both return the per-event listing name + property name the viewer
needs in a single round trip, and both are tenant-scoped via
``listings.organization_id``.

Date overlap semantics differ between the two, and the difference matters:

- ``ListingBlackout.ends_on`` is EXCLUSIVE (iCal RFC 5545), so a blackout is
  in the window when ``starts_on < window_to AND ends_on > window_from``.
- ``SignedLease.ends_on`` is INCLUSIVE — a lease running through Aug 9 covers
  Aug 9 — so the test is ``starts_on < window_to AND ends_on >= window_from``.

The mapper converts a lease's inclusive end to the exclusive end the response
schema promises; nothing downstream should have to remember this.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.calendar_constants import LEASE_OCCUPANCY_STATUSES
from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
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


async def query_lease_events(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    from_: date,
    to: date,
    listing_ids: Sequence[uuid.UUID] | None = None,
    property_ids: Sequence[uuid.UUID] | None = None,
) -> list[tuple[SignedLease, Listing, Property, Applicant]]:
    """Return occupying leases + listing + property + tenant within the window.

    ``listing_ids`` / ``property_ids`` narrow the result the same way they do
    for blackouts. There is no ``sources`` parameter — every row this returns
    has source ``lease`` by construction, so the caller decides whether to run
    this query at all rather than filtering inside it.

    Excluded, all for the same reason (they do not describe someone living in
    the listing on those dates):

    - statuses outside ``LEASE_OCCUPANCY_STATUSES``
    - soft-deleted leases and soft-deleted listings
    - leases with no ``listing_id`` — the grid is listing-rows, so a lease
      with nothing to sit on cannot be drawn (the join drops these)
    - leases missing either date bound, which have no extent to draw
    """
    stmt = (
        select(SignedLease, Listing, Property, Applicant)
        .join(Listing, Listing.id == SignedLease.listing_id)
        .join(Property, Property.id == Listing.property_id)
        .join(Applicant, Applicant.id == SignedLease.applicant_id)
        .where(
            Listing.organization_id == organization_id,
            Listing.deleted_at.is_(None),
            SignedLease.deleted_at.is_(None),
            SignedLease.status.in_(sorted(LEASE_OCCUPANCY_STATUSES)),
            SignedLease.starts_on.is_not(None),
            SignedLease.ends_on.is_not(None),
            # Inclusive end — see module docstring.
            SignedLease.starts_on < to,
            SignedLease.ends_on >= from_,
        )
        .order_by(
            Property.name.asc(),
            Listing.title.asc(),
            SignedLease.starts_on.asc(),
            SignedLease.id.asc(),
        )
    )

    if listing_ids:
        stmt = stmt.where(SignedLease.listing_id.in_(list(listing_ids)))
    if property_ids:
        stmt = stmt.where(Listing.property_id.in_(list(property_ids)))

    result = await db.execute(stmt)
    return [(lease, listing, prop, applicant) for lease, listing, prop, applicant in result.all()]
