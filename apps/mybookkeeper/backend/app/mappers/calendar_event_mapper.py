"""Convert calendar source rows into ``CalendarEventResponse``.

The viewer unions two unrelated tables into one event list, so the shape
conversion lives here rather than in the service: ``listing_blackouts`` rows
map almost field-for-field, while ``signed_leases`` rows need a tenant name
and an end-date convention change.

``CalendarEventResponse.ends_on`` is EXCLUSIVE (iCal RFC 5545), matching
``ListingBlackout``. ``SignedLease.ends_on`` is INCLUSIVE. ``lease_to_event``
is the single place that bridges the two — a lease running through Aug 9 is
emitted as ``ends_on = Aug 10`` so the grid draws it over Aug 9 and stops.
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from app.core.calendar_constants import LEASE_SOURCE
from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.properties.property import Property
from app.schemas.calendar.calendar_event_response import CalendarEventResponse

# Shown when a tenant has no ``legal_name`` on file. Matches the fallback
# ``receipt_service`` uses on receipt PDFs so the same tenant does not read
# as two different people across the app.
UNNAMED_TENANT_LABEL = "Tenant"


def blackout_to_event(
    blackout: ListingBlackout,
    listing: Listing,
    prop: Property,
    attachment_count: int,
) -> CalendarEventResponse:
    """Map a channel booking or manual block."""
    return CalendarEventResponse(
        id=blackout.id,
        listing_id=blackout.listing_id,
        listing_name=listing.title,
        property_id=prop.id,
        property_name=prop.name,
        starts_on=blackout.starts_on,
        ends_on=blackout.ends_on,
        source=blackout.source,
        source_event_id=blackout.source_event_id,
        summary=None,
        host_notes=blackout.host_notes,
        attachment_count=attachment_count,
        updated_at=blackout.updated_at,
    )


def lease_to_event(
    lease: SignedLease,
    listing: Listing | None,
    prop: Property | None,
    applicant: Applicant,
) -> CalendarEventResponse:
    """Map tenant occupancy from a signed lease.

    ``summary`` carries the tenant's name — the whole point of surfacing
    leases here is seeing *who* is in a room, not just that it is taken.

    ``listing`` and ``prop`` are optional because ``signed_leases.listing_id``
    is nullable: a host can record a tenancy without linking it to a listing.
    Those leases map to an event with null listing/property rather than being
    dropped, and the viewer groups them under an "unassigned" heading.

    Notes and attachments stay empty: those endpoints are keyed by blackout
    id, and this event's id is a lease id. The frontend hides both sections
    for this source rather than offering an edit that would 404.

    The caller guarantees non-null dates (``query_lease_events`` filters
    them out), so the ``+ 1 day`` conversion is always safe.
    """
    assert lease.starts_on is not None and lease.ends_on is not None
    return CalendarEventResponse(
        id=lease.id,
        listing_id=listing.id if listing else None,
        listing_name=listing.title if listing else None,
        property_id=prop.id if prop else None,
        property_name=prop.name if prop else None,
        starts_on=lease.starts_on,
        ends_on=lease.ends_on + timedelta(days=1),
        source=LEASE_SOURCE,
        source_event_id=None,
        summary=applicant.legal_name or UNNAMED_TENANT_LABEL,
        host_notes=None,
        attachment_count=0,
        updated_at=lease.updated_at,
    )


def event_sort_key(
    event: CalendarEventResponse,
) -> tuple[bool, str, str, object, uuid.UUID]:
    """Ordering for the merged list.

    Mirrors what each repository query orders by, applied after the union so
    blackouts and leases interleave correctly instead of arriving in two
    separate blocks.

    The leading flag is the Python equivalent of the queries' ``NULLS LAST``:
    ``False`` sorts before ``True``, so events with a listing come first and
    unassigned leases collect at the end. It also keeps the comparison
    total — ``None`` and ``str`` are not orderable against each other.
    """
    return (
        event.property_name is None,
        event.property_name or "",
        event.listing_name or "",
        event.starts_on,
        event.id,
    )
