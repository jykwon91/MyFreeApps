"""Channel-listing service — orchestrates CRUD on (listing, channel) pairs.

Per layered-architecture rule (CLAUDE.md): services orchestrate
(load → decide → persist), routes are thin wrappers, repos own queries.
Tenant isolation is via the parent listing's ``organization_id`` — checked
against ``ctx.organization_id`` before any write.

The service also owns:
- conversion of a row to ``ChannelListingResponse`` (including the full
  outbound iCal URL, built from settings + token here so callers don't
  duplicate the URL-construction logic)
- cascade cleanup of ``listing_blackouts`` whose ``source = channel_id``
  when a channel_listing is removed
- channel-id existence check (404 when the dropdown is fed bad data)
"""
from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import unit_of_work
from app.models.listings.channel import Channel
from app.models.listings.channel_listing import ChannelListing
from app.repositories import (
    channel_listing_repo,
    channel_repo,
    listing_blackout_repo,
    listing_repo,
)
from app.schemas.listings.channel_listing_create_request import (
    ChannelListingCreateRequest,
)
from app.schemas.listings.channel_listing_response import ChannelListingResponse
from app.schemas.listings.channel_listing_update_request import (
    ChannelListingUpdateRequest,
)
from app.schemas.listings.channel_response import ChannelResponse


class ListingNotFoundError(LookupError):
    """Listing missing, soft-deleted, or out of caller's organization."""


class ChannelNotFoundError(LookupError):
    """The supplied ``channel_id`` is not a valid channel slug."""


class ChannelListingNotFoundError(LookupError):
    """The channel_listing does not exist on the supplied listing."""


class ChannelAlreadyLinkedError(ValueError):
    """A row already exists for ``(listing_id, channel_id)``.

    Maps to HTTP 409 in the route layer.
    """


def _build_export_url(token: str) -> str:
    """Construct the unauthenticated outbound iCal URL channels poll.

    Prefers ``settings.app_url`` (the prod public origin), falls back to
    ``settings.frontend_url`` for dev/CI. Path is the public route
    ``/api/calendar/<token>.ics``. Channels treat this URL as opaque —
    we MUST keep the path stable.
    """
    base = (settings.app_url or settings.frontend_url).rstrip("/")
    return f"{base}/api/calendar/{token}.ics"


def _to_response(row: ChannelListing, channel: Channel | None = None) -> ChannelListingResponse:
    """Serialize an ORM row to its API representation.

    Embeds the full outbound iCal URL so callers can copy/paste it into
    the channel without reconstructing it themselves. Embeds the linked
    ``ChannelResponse`` when supplied so the UI can render the channel
    name + capability flags without a second round trip.
    """
    return ChannelListingResponse(
        id=str(row.id),
        listing_id=str(row.listing_id),
        channel_id=row.channel_id,
        channel=ChannelResponse.model_validate(channel) if channel is not None else None,
        external_url=row.external_url,
        external_id=row.external_id,
        ical_import_url=row.ical_import_url,
        last_imported_at=row.last_imported_at,
        last_import_error=row.last_import_error,
        ical_export_token=row.ical_export_token,
        ical_export_url=_build_export_url(row.ical_export_token),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def list_channels(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
) -> list[ChannelListingResponse]:
    """Return every channel_listing for a listing the caller's org owns.

    Raises ``ListingNotFoundError`` if the listing is missing / out-of-org.
    Each response includes the joined channel metadata so the UI can
    render the channel name and the iCal capability flags without
    a second request.
    """
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

        rows = await channel_listing_repo.list_by_listing(db, listing.id)
        # Eager-load channels in one shot rather than N+1.
        channels = {c.id: c for c in await channel_repo.list_all(db)}
        return [_to_response(r, channels.get(r.channel_id)) for r in rows]


async def create_channel_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    payload: ChannelListingCreateRequest,
) -> ChannelListingResponse:
    """Create a new (listing, channel) link.

    Conflict order:
      1. Listing missing / out-of-org → 404
      2. ``channel_id`` not a known channel → 404 (specific message —
         the dropdown shouldn't let this happen, but we defend in depth)
      3. (listing_id, channel_id) already linked → 409
    The cross-tenant collision case for the iCal export token is handled
    via UNIQUE(ical_export_token) at the DB layer — collision odds are
    astronomical (~1 in 2^192) but if it ever fires we re-raise the
    IntegrityError so the operator sees a 5xx and we get a Sentry alert.
    """
    external_url_str = str(payload.external_url)
    ical_import_url_str = (
        str(payload.ical_import_url) if payload.ical_import_url is not None else None
    )

    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

        channel = await channel_repo.get_by_id(db, payload.channel_id)
        if channel is None:
            raise ChannelNotFoundError(f"Unknown channel: {payload.channel_id}")

        if await channel_listing_repo.exists_for_channel(
            db, listing.id, payload.channel_id,
        ):
            raise ChannelAlreadyLinkedError(
                f"This listing is already linked to {channel.name}.",
            )

        try:
            row = await channel_listing_repo.create(
                db,
                listing_id=listing.id,
                channel_id=payload.channel_id,
                external_url=external_url_str,
                external_id=payload.external_id,
                ical_import_url=ical_import_url_str,
                ical_import_secret_token=payload.ical_import_secret_token,
            )
        except IntegrityError as exc:
            # The UNIQUE(listing_id, channel_id) is the user-facing 409.
            # If it fires after our pre-check (race condition between two
            # concurrent requests), surface the same friendly message.
            raise ChannelAlreadyLinkedError(
                f"This listing is already linked to {channel.name}.",
            ) from exc

        return _to_response(row, channel)


async def update_channel_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    channel_listing_id: uuid.UUID,
    payload: ChannelListingUpdateRequest,
) -> ChannelListingResponse:
    """Apply allowlisted updates to a channel_listing.

    Authorisation: load the row, look up its parent listing, verify the
    listing belongs to the caller's org. Out-of-org access surfaces as
    404 (never 403 — never leak existence).
    """
    fields = payload.to_update_dict()

    async with unit_of_work() as db:
        row = await channel_listing_repo.get_by_channel_listing_id(db, channel_listing_id)
        if row is None:
            raise ChannelListingNotFoundError(
                f"Channel listing {channel_listing_id} not found",
            )

        listing = await listing_repo.get_by_id(db, row.listing_id, organization_id)
        if listing is None:
            # Either the parent listing is in another org, or it's been
            # soft-deleted. Either way: 404 from the caller's perspective.
            raise ChannelListingNotFoundError(
                f"Channel listing {channel_listing_id} not found",
            )

        updated = await channel_listing_repo.update(
            db, channel_listing_id, listing.id, fields,
        )
        if updated is None:
            raise ChannelListingNotFoundError(
                f"Channel listing {channel_listing_id} not found",
            )

        channel = await channel_repo.get_by_id(db, updated.channel_id)
        return _to_response(updated, channel)


async def delete_channel_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    channel_listing_id: uuid.UUID,
) -> None:
    """Hard-delete a channel_listing and its imported blackouts.

    Cascade behaviour: blackouts whose ``source`` matches the deleted
    channel's slug are removed. Manual blackouts (``source = "manual"``)
    are preserved — they were never owned by this channel.
    """
    async with unit_of_work() as db:
        row = await channel_listing_repo.get_by_channel_listing_id(db, channel_listing_id)
        if row is None:
            raise ChannelListingNotFoundError(
                f"Channel listing {channel_listing_id} not found",
            )

        listing = await listing_repo.get_by_id(db, row.listing_id, organization_id)
        if listing is None:
            raise ChannelListingNotFoundError(
                f"Channel listing {channel_listing_id} not found",
            )

        # Order matters: clean up blackouts first (the channel_listing
        # row is what tells us the source slug), then drop the row.
        await listing_blackout_repo.delete_by_listing_and_source(
            db, listing.id, row.channel_id,
        )
        deleted = await channel_listing_repo.delete_by_id(
            db, channel_listing_id, listing.id,
        )
        if not deleted:
            raise ChannelListingNotFoundError(
                f"Channel listing {channel_listing_id} not found",
            )
