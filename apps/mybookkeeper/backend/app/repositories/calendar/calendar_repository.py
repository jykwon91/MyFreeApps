"""Repository for the unified calendar viewer.

Two queries feed the viewer, one per event source:

``query_events`` joins ``listing_blackouts`` → ``listings`` → ``properties``
— channel bookings and manual blocks; tenant-scoped via
``listings.organization_id`` because a blackout carries no organization of its
own. ``query_lease_events`` OUTER-joins ``signed_leases`` → ``listings`` →
``properties`` and inner-joins ``applicants`` — tenant occupancy, scoped on
``signed_leases.organization_id``. Both return the per-event listing name +
property name the viewer needs in a single round trip.

The lease join is outer, and the scope column differs, for the same reason:
``signed_leases.listing_id`` is nullable, so a lease the host never linked to
a listing has no listing to scope on or read a name from. Inner-joining would
drop it from the calendar without a trace — the host sees a tenancy missing
and no explanation. Such a lease is returned with ``None`` for its listing and
property; the viewer groups those under an "unassigned" heading.

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

from sqlalchemy import and_, select
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
) -> list[tuple[SignedLease, Listing | None, Property | None, Applicant]]:
    """Return occupying leases + listing + property + tenant within the window.

    ``listing_ids`` / ``property_ids`` narrow the result the same way they do
    for blackouts. There is no ``sources`` parameter — every row this returns
    has source ``lease`` by construction, so the caller decides whether to run
    this query at all rather than filtering inside it.

    Excluded, all for the same reason (they do not describe someone living in
    a listing on those dates):

    - statuses outside ``LEASE_OCCUPANCY_STATUSES``
    - soft-deleted leases
    - leases missing either date bound, which have no extent to draw

    A lease with no ``listing_id`` — or one pointing at a soft-deleted listing
    — is NOT excluded. It comes back with ``None`` in the listing and property
    slots. The tenancy is real and the host needs to see it; which listing it
    belongs to is a separate, fixable gap. The soft-delete test lives in the
    join's ON clause rather than the WHERE so a deleted listing degrades the
    lease to unassigned instead of erasing it.

    Narrowing by ``listing_ids`` or ``property_ids`` does drop unassigned
    leases, which is correct: the host asked for one listing's occupancy, and
    a lease with no listing is not part of that answer.
    """
    stmt = (
        select(SignedLease, Listing, Property, Applicant)
        .outerjoin(
            Listing,
            and_(
                Listing.id == SignedLease.listing_id,
                Listing.deleted_at.is_(None),
            ),
        )
        .outerjoin(Property, Property.id == Listing.property_id)
        .join(Applicant, Applicant.id == SignedLease.applicant_id)
        .where(
            # Scoped on the lease, not the listing — an unassigned lease has
            # no listing to carry the organization. ``signed_leases`` owns an
            # organization_id of its own precisely for this.
            SignedLease.organization_id == organization_id,
            SignedLease.deleted_at.is_(None),
            SignedLease.status.in_(sorted(LEASE_OCCUPANCY_STATUSES)),
            SignedLease.starts_on.is_not(None),
            SignedLease.ends_on.is_not(None),
            # Inclusive end — see module docstring.
            SignedLease.starts_on < to,
            SignedLease.ends_on >= from_,
        )
        .order_by(
            # Unassigned sorts last, matching the viewer's grouping.
            Property.name.asc().nulls_last(),
            Listing.title.asc().nulls_last(),
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
