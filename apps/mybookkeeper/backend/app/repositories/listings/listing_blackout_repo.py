"""Repository for ``listing_blackouts`` — date-range blocks on a listing.

Used by:
- the outbound iCal serializer (``list_by_listing``)
- the inbound iCal poll job (``upsert_by_uid``, ``delete_missing_uids``)
- the service that removes a channel_listing (``delete_by_listing_and_source``)
- the blackout notes + attachment endpoints (``get_by_id_scoped``, ``update_notes``)
"""
import uuid
from datetime import date

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout


async def list_by_listing(
    db: AsyncSession, listing_id: uuid.UUID,
) -> list[ListingBlackout]:
    """Return every blackout for a listing, regardless of source.

    Ordered by ``starts_on`` asc so the outbound iCal serializer produces
    a deterministic VEVENT order (helps consumer dedup and cache
    behaviour).
    """
    result = await db.execute(
        select(ListingBlackout)
        .where(ListingBlackout.listing_id == listing_id)
        .order_by(ListingBlackout.starts_on.asc(), ListingBlackout.id.asc())
    )
    return list(result.scalars().all())


async def list_uids_by_source(
    db: AsyncSession, listing_id: uuid.UUID, source: str,
) -> set[str]:
    """Return the set of source_event_ids currently stored for (listing, source).

    Used by the iCal poll job to compute the diff between the feed's
    current UID set and the DB's stored UID set — UIDs in the DB but
    not in the feed are taken as cancellations and deleted.
    """
    result = await db.execute(
        select(ListingBlackout.source_event_id).where(
            ListingBlackout.listing_id == listing_id,
            ListingBlackout.source == source,
            ListingBlackout.source_event_id.is_not(None),
        )
    )
    return {row for row in result.scalars().all() if row is not None}


async def upsert_by_uid(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    source: str,
    source_event_id: str,
    starts_on: date,
    ends_on: date,
) -> ListingBlackout:
    """Insert or update a blackout row keyed on (listing_id, source, uid).

    Returns the persisted row. Re-running the poll with an unchanged
    VEVENT is a no-op (dates match, row stays). A re-run with new dates
    updates the row in place.
    """
    result = await db.execute(
        select(ListingBlackout).where(
            ListingBlackout.listing_id == listing_id,
            ListingBlackout.source == source,
            ListingBlackout.source_event_id == source_event_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        # Only update the date fields — host_notes is host-owned and must
        # survive re-polls. Never assign host_notes here.
        existing.starts_on = starts_on
        existing.ends_on = ends_on
        await db.flush()
        return existing

    row = ListingBlackout(
        listing_id=listing_id,
        source=source,
        source_event_id=source_event_id,
        starts_on=starts_on,
        ends_on=ends_on,
    )
    db.add(row)
    await db.flush()
    return row


async def delete_missing_uids(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    source: str,
    keep_uids: set[str],
) -> int:
    """Delete blackouts for (listing, source) whose UID is not in ``keep_uids``.

    A UID disappearing from the feed is taken as a cancellation. Returns
    the number of rows deleted.
    """
    if not keep_uids:
        # Nothing to keep — delete everything for this (listing, source)
        # that has a UID. (Manual rows have source != channel slug and are
        # never affected.)
        result = await db.execute(
            delete(ListingBlackout).where(
                ListingBlackout.listing_id == listing_id,
                ListingBlackout.source == source,
                ListingBlackout.source_event_id.is_not(None),
            )
        )
        return result.rowcount or 0

    result = await db.execute(
        delete(ListingBlackout).where(
            and_(
                ListingBlackout.listing_id == listing_id,
                ListingBlackout.source == source,
                ListingBlackout.source_event_id.is_not(None),
                ListingBlackout.source_event_id.notin_(keep_uids),
            )
        )
    )
    return result.rowcount or 0


async def create(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    starts_on: date,
    ends_on: date,
    source: str,
    source_event_id: str | None = None,
) -> ListingBlackout:
    """Create a single blackout row.

    Used by the unified calendar viewer's E2E seed path (where the
    iCal poll job is bypassed). Production blackout writes go through
    ``upsert_by_uid`` instead — that path is idempotent on the
    (listing, source, uid) key. This function does NOT enforce any
    upsert: callers must dedupe upstream.
    """
    row = ListingBlackout(
        listing_id=listing_id,
        starts_on=starts_on,
        ends_on=ends_on,
        source=source,
        source_event_id=source_event_id,
    )
    db.add(row)
    await db.flush()
    return row


async def delete_by_id_scoped_to_organization(
    db: AsyncSession,
    *,
    blackout_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Hard-delete a blackout, scoped via JOIN to the parent listing's org.

    The blackout row has no tenant column — isolation is enforced
    through the ``listings.organization_id`` link. Returns True if a
    row was deleted, False otherwise.
    """
    from app.models.listings.listing import Listing
    result = await db.execute(
        select(ListingBlackout)
        .join(Listing, Listing.id == ListingBlackout.listing_id)
        .where(
            ListingBlackout.id == blackout_id,
            Listing.organization_id == organization_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return False
    await db.execute(
        delete(ListingBlackout).where(ListingBlackout.id == blackout_id),
    )
    return True


async def get_by_id_scoped_to_organization(
    db: AsyncSession,
    *,
    blackout_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> ListingBlackout | None:
    """Fetch a blackout row, scoped via JOIN to the parent listing's org.

    Returns None if the blackout does not exist OR belongs to a different org.
    Used by the notes-update and attachment endpoints for tenant-scoped access.
    """
    result = await db.execute(
        select(ListingBlackout)
        .join(Listing, Listing.id == ListingBlackout.listing_id)
        .where(
            ListingBlackout.id == blackout_id,
            Listing.organization_id == organization_id,
            Listing.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def update_notes(
    db: AsyncSession,
    *,
    blackout_id: uuid.UUID,
    host_notes: str | None,
) -> None:
    """Update only the host_notes column on a blackout row.

    The iCal poller MUST NOT call this function — only the explicit
    PATCH /listings/blackouts/{id} endpoint does. Kept narrow so the
    accidental-overwrite risk is minimised.
    """
    result = await db.execute(
        select(ListingBlackout).where(ListingBlackout.id == blackout_id)
    )
    row = result.scalar_one()
    row.host_notes = host_notes
    await db.flush()


async def delete_by_listing_and_source(
    db: AsyncSession, listing_id: uuid.UUID, source: str,
) -> int:
    """Delete every blackout for (listing, source).

    Called when removing a channel_listing — the linked channel's imported
    blackouts must be cleaned up. Manual blackouts (source = ``manual``)
    are preserved by definition since they wouldn't share a source slug
    with any channel.
    """
    result = await db.execute(
        delete(ListingBlackout).where(
            ListingBlackout.listing_id == listing_id,
            ListingBlackout.source == source,
        )
    )
    return result.rowcount or 0
