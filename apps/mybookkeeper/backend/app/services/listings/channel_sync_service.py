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

The poll goes through ``platform_shared.core.capped_fetch`` (SSRF guard on
every hop, one overall deadline, a streamed size cap; limits in
``app.core.ical_feed_constants``). ``settings.app_url`` is sent
as the ``User-Agent`` so channels can identify the source of the polls
in their logs.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

import httpx

from platform_shared.core.capped_fetch import fetch_capped
from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.url_host import url_host
from platform_shared.core.url_safety import UnsafeURLError

from app.core.config import settings
from app.core.ical_feed_constants import (
    ICAL_FEED_MAX_BYTES,
    ICAL_FEED_MAX_REDIRECTS,
    ICAL_FEED_PHASE_TIMEOUT_SECONDS,
    ICAL_FEED_TOTAL_TIMEOUT_SECONDS,
)
from app.db.session import unit_of_work
from app.models.listings.channel_listing import ChannelListing
from app.repositories import channel_listing_repo, listing_blackout_repo
from app.services.listings.ical_parser import parse_ical_blackouts

logger = logging.getLogger(__name__)

ImportErrorCategory = Literal["transient", "auth", "config", "unknown"]

def _user_agent() -> str:
    base = settings.app_url or "https://mybookkeeper.app"
    return f"MyBookkeeper-iCal-Poller/1.0 ({base})"


async def _fetch(url: str, *, client: httpx.AsyncClient) -> bytes:
    """Fetch a single iCal feed within its time and size limits.

    The feed URL is user-supplied (``ical_import_url``). ``fetch_capped``
    checks every hop with the SSRF guard before egress, bounds the whole
    fetch with one deadline, and stops reading once the body passes the cap.

    Raises:
        UnsafeURLError: the URL (or a redirect hop) resolves to a non-public
            address, or is not http(s) on a standard web port.
        CappedFetchError: timeout, non-2xx response, network failure, too
            many redirects, or a body over ``ICAL_FEED_MAX_BYTES``.
    """
    response = await fetch_capped(
        client,
        url,
        max_bytes=ICAL_FEED_MAX_BYTES,
        total_timeout_seconds=ICAL_FEED_TOTAL_TIMEOUT_SECONDS,
        max_redirects=ICAL_FEED_MAX_REDIRECTS,
        headers={"User-Agent": _user_agent(), "Accept": "text/calendar"},
    )
    return response.content


def _category_for(exc: CappedFetchError) -> ImportErrorCategory:
    """Who can fix a failed fetch: the channel (auth), the host (config) or time."""
    if exc.reason == "http_status" and exc.status_code is not None:
        if exc.status_code in (401, 403):
            return "auth"
        if 400 <= exc.status_code < 500:
            return "config"
        return "transient"
    if exc.reason in (
        "too_large", "too_many_redirects", "bad_encoding", "unexpected_content_type",
    ):
        return "config"
    return "transient"


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

    # Logs name the feed's host only: the feed URL itself is a secret.
    host = url_host(channel_listing.ical_import_url)
    category: ImportErrorCategory
    try:
        payload = await _fetch(channel_listing.ical_import_url, client=client)
        parsed = parse_ical_blackouts(payload)
    except CappedFetchError as exc:
        # fetch_capped already logged the reason and host; the message, too,
        # names the host only.
        category = _category_for(exc)
        message = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "iCal poll %s for channel_listing=%s: %s",
            category, channel_listing.id, message,
        )
        async with unit_of_work() as db:
            await channel_listing_repo.mark_imported(
                db,
                channel_listing.id,
                last_imported_at=datetime.now(timezone.utc),
                last_import_error=message[:500],
                last_import_error_category=category,
            )
        return
    except UnsafeURLError as exc:
        # SSRF guard rejected the (user-supplied) feed URL or a redirect hop.
        # A configuration problem the operator fixes by editing the URL — not
        # a transient outage, and not worth an exception-level stack trace.
        category = "config"
        message = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "iCal poll blocked unsafe URL for channel_listing=%s host=%s: %s",
            channel_listing.id, host, message,
        )
        async with unit_of_work() as db:
            await channel_listing_repo.mark_imported(
                db,
                channel_listing.id,
                last_imported_at=datetime.now(timezone.utc),
                last_import_error=message[:500],
                last_import_error_category=category,
            )
        return
    except Exception as exc:  # noqa: BLE001 — parse errors, unexpected failures
        category = "unknown"
        message = f"{type(exc).__name__}: {exc}"
        logger.exception(
            "iCal poll unknown error for channel_listing=%s host=%s",
            channel_listing.id, host,
        )
        async with unit_of_work() as db:
            await channel_listing_repo.mark_imported(
                db,
                channel_listing.id,
                last_imported_at=datetime.now(timezone.utc),
                last_import_error=message[:500],
                last_import_error_category=category,
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
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(ICAL_FEED_PHASE_TIMEOUT_SECONDS),
    ) as client:
        for row in rows:
            await poll_one(row, client=client)
            polled += 1

    return polled
