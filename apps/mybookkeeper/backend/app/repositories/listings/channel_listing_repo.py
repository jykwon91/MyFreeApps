"""Repository for the ``channel_listings`` table — one row per
(listing, channel) pair the host has linked.

Per layered-architecture rule (CLAUDE.md): all DB access for this domain
goes through this module. Services orchestrate; routes are thin wrappers.
"""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.channel_listing import ChannelListing


# PATCH-allowlist. ``ical_export_token`` is server-managed (rotation only via
# explicit endpoint, future PR); ``last_imported_at`` and ``last_import_error``
# are written by the polling worker, never the user; ``listing_id`` and
# ``channel_id`` are immutable post-create — moving rows between listings or
# channels is a delete + recreate.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "external_url",
    "external_id",
    "ical_import_url",
    "ical_import_secret_token",
})


async def list_by_listing(
    db: AsyncSession, listing_id: uuid.UUID,
) -> list[ChannelListing]:
    """Return all channel_listings rows for a listing, ordered by created_at."""
    result = await db.execute(
        select(ChannelListing)
        .where(ChannelListing.listing_id == listing_id)
        .order_by(ChannelListing.created_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession, channel_listing_id: uuid.UUID, listing_id: uuid.UUID,
) -> ChannelListing | None:
    """Return one channel_listing iff it belongs to the given listing."""
    result = await db.execute(
        select(ChannelListing).where(
            ChannelListing.id == channel_listing_id,
            ChannelListing.listing_id == listing_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_channel_listing_id(
    db: AsyncSession, channel_listing_id: uuid.UUID,
) -> ChannelListing | None:
    """Return one channel_listing by primary key, with no listing filter.

    Used by the polling worker (which iterates rows globally) and by the
    PATCH/DELETE service after the listing has already been authorised.
    """
    result = await db.execute(
        select(ChannelListing).where(ChannelListing.id == channel_listing_id),
    )
    return result.scalar_one_or_none()


async def get_by_export_token(
    db: AsyncSession, token: str,
) -> ChannelListing | None:
    """Return the channel_listing identified by the outbound iCal token, if any.

    Used by the unauthenticated outbound iCal endpoint. A miss returns
    ``None`` and the route returns 404 — never a 401/403, so an attacker
    cannot distinguish "wrong token" from "token format invalid".
    """
    result = await db.execute(
        select(ChannelListing).where(ChannelListing.ical_export_token == token),
    )
    return result.scalar_one_or_none()


async def exists_for_channel(
    db: AsyncSession, listing_id: uuid.UUID, channel_id: str,
) -> bool:
    """Pre-check the (listing_id, channel_id) UNIQUE constraint."""
    result = await db.execute(
        select(ChannelListing.id).where(
            ChannelListing.listing_id == listing_id,
            ChannelListing.channel_id == channel_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def list_pollable(db: AsyncSession) -> list[ChannelListing]:
    """Return every channel_listing with a non-NULL ``ical_import_url``.

    Powers the scheduler's iCal poll. No date filtering — every channel
    that has a feed gets polled on each cycle. Volume is small (one row
    per (listing, channel) pair the host has set up).
    """
    result = await db.execute(
        select(ChannelListing).where(ChannelListing.ical_import_url.is_not(None)),
    )
    return list(result.scalars().all())


async def create(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    channel_id: str,
    external_url: str | None,
    external_id: str | None,
    ical_import_url: str | None,
    ical_import_secret_token: str | None,
) -> ChannelListing:
    """Insert a new channel_listing.

    The model's ``ical_export_token`` default fires here — never set it
    explicitly. The DB UNIQUE on (listing_id, channel_id) is the
    authoritative collision guard; the caller should pre-check via
    ``exists_for_channel`` for friendly 409 messaging.
    """
    row = ChannelListing(
        listing_id=listing_id,
        channel_id=channel_id,
        external_url=external_url,
        external_id=external_id,
        ical_import_url=ical_import_url,
        ical_import_secret_token=ical_import_secret_token,
    )
    db.add(row)
    await db.flush()
    return row


async def update(
    db: AsyncSession,
    channel_listing_id: uuid.UUID,
    listing_id: uuid.UUID,
    fields: dict[str, Any],
) -> ChannelListing | None:
    """Apply allowlisted updates to a channel_listing.

    Returns the refreshed row, or ``None`` if it doesn't exist on this
    listing. Fields outside ``_UPDATABLE_COLUMNS`` are silently dropped
    (defence-in-depth on top of Pydantic's ``extra="forbid"``).
    """
    row = await get_by_id(db, channel_listing_id, listing_id)
    if row is None:
        return None

    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return row

    for key, value in safe_fields.items():
        setattr(row, key, value)
    await db.flush()
    return row


async def delete_by_id(
    db: AsyncSession, channel_listing_id: uuid.UUID, listing_id: uuid.UUID,
) -> bool:
    """Hard-delete a channel_listing scoped to a listing.

    Returns True iff a row was deleted. Cascade behaviour: the row's
    listing_blackouts (matched by ``source = channel_id``) are NOT deleted
    by FK — that's the service's responsibility (channel_listing.delete
    must clean up blackouts attributed to that channel for this listing).
    """
    result = await db.execute(
        delete(ChannelListing).where(
            ChannelListing.id == channel_listing_id,
            ChannelListing.listing_id == listing_id,
        )
    )
    return (result.rowcount or 0) > 0


async def mark_imported(
    db: AsyncSession,
    channel_listing_id: uuid.UUID,
    *,
    last_imported_at: datetime,
    last_import_error: str | None,
) -> None:
    """Update poll-status columns. Called by the iCal polling worker."""
    row = await get_by_channel_listing_id(db, channel_listing_id)
    if row is None:
        return
    row.last_imported_at = last_imported_at
    row.last_import_error = last_import_error
    await db.flush()
