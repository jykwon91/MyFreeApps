"""Inbound iCal poll service.

Per RENTALS_PLAN.md PR 1.4: every 15 minutes the scheduler polls each
channel_listing with a non-NULL ``ical_import_url``, parses the response
with ``icalendar``, and reconciles the resulting events against the
DB-stored blackouts for that (listing, source) pair:

- New UID → insert
- Existing UID with new dates → update in place
- UID disappears → delete (cancellation)

On HTTP / parse failure we set ``last_import_error`` on the
channel_listing row and PRESERVE the existing blackouts — better to
hold a few stale dates than to over-block by accident or under-block
during a transient outage.

The poll uses ``httpx`` with a 10s timeout. ``settings.app_url`` is sent
as the ``User-Agent`` so channels can identify the source of the polls
in their logs.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.db.session import unit_of_work
from app.models.listings.channel_listing import ChannelListing
from app.repositories import channel_listing_repo, listing_blackout_repo
from app.services.listings.ical_parser import parse_ical_blackouts

logger = logging.getLogger(__name__)

# Per-feed HTTP timeout. Channels' iCal exports are tiny (text), so 10s
# is generous. Any longer and a slow channel could starve the scheduler
# loop on a host with many listings.
_POLL_TIMEOUT_SECONDS: float = 10.0


def _user_agent() -> str:
    base = settings.app_url or "https://mybookkeeper.app"
    return f"MyBookkeeper-iCal-Poller/1.0 ({base})"


async def _fetch(url: str, *, client: httpx.AsyncClient) -> bytes:
    """Fetch a single iCal feed. Raises on HTTP error / timeout."""
    response = await client.get(
        url,
        timeout=_POLL_TIMEOUT_SECONDS,
        headers={"User-Agent": _user_agent(), "Accept": "text/calendar"},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.content


async def poll_one(
    channel_listing: ChannelListing,
    *,
    client: httpx.AsyncClient,
) -> None:
    """Poll a single channel_listing and reconcile its blackouts.

    Updates ``last_imported_at`` / ``last_import_error`` either way.
    Each poll is its own transaction so a failure on listing N does
    not roll back the success of listing N-1.
    """
    if channel_listing.ical_import_url is None:
        return

    try:
        payload = await _fetch(channel_listing.ical_import_url, client=client)
        parsed = parse_ical_blackouts(payload)
    except Exception as exc:  # noqa: BLE001 — we intentionally catch broadly
        # HTTP error, timeout, or parse error — preserve existing data
        # and surface the message to the operator via the UI.
        logger.warning(
            "iCal poll failed for channel_listing=%s url=%s: %s",
            channel_listing.id, channel_listing.ical_import_url, exc,
        )
        async with unit_of_work() as db:
            await channel_listing_repo.mark_imported(
                db,
                channel_listing.id,
                last_imported_at=datetime.now(timezone.utc),
                last_import_error=str(exc)[:500],
            )
        return

    seen_uids = {p.uid for p in parsed}

    async with unit_of_work() as db:
        for parsed_event in parsed:
            await listing_blackout_repo.upsert_by_uid(
                db,
                listing_id=channel_listing.listing_id,
                source=channel_listing.channel_id,
                source_event_id=parsed_event.uid,
                starts_on=parsed_event.starts_on,
                ends_on=parsed_event.ends_on,
            )

        # UIDs that disappeared from the feed are cancellations — drop them.
        await listing_blackout_repo.delete_missing_uids(
            db,
            listing_id=channel_listing.listing_id,
            source=channel_listing.channel_id,
            keep_uids=seen_uids,
        )

        await channel_listing_repo.mark_imported(
            db,
            channel_listing.id,
            last_imported_at=datetime.now(timezone.utc),
            last_import_error=None,
        )


async def poll_all() -> int:
    """Poll every channel_listing with an inbound iCal URL.

    Returns the count of rows polled. Errors on individual rows are
    logged + recorded on the row but do not stop the loop.
    """
    async with unit_of_work() as db:
        rows = await channel_listing_repo.list_pollable(db)

    if not rows:
        return 0

    polled = 0
    async with httpx.AsyncClient() as client:
        for row in rows:
            await poll_one(row, client=client)
            polled += 1

    return polled
