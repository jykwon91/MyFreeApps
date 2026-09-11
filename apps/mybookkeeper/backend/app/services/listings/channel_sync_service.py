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
from typing import Literal
from urllib.parse import urljoin

import httpx

from platform_shared.core.url_safety import UnsafeURLError, assert_url_safe

from app.core.config import settings
from app.db.session import unit_of_work
from app.models.listings.channel_listing import ChannelListing
from app.repositories import channel_listing_repo, listing_blackout_repo
from app.services.listings.ical_parser import parse_ical_blackouts

logger = logging.getLogger(__name__)

ImportErrorCategory = Literal["transient", "auth", "config", "unknown"]

# Per-feed HTTP timeout. Channels' iCal exports are tiny (text), so 10s
# is generous. Any longer and a slow channel could starve the scheduler
# loop on a host with many listings.
_POLL_TIMEOUT_SECONDS: float = 10.0

# Redirects are followed MANUALLY (httpx auto-follow disabled) so the SSRF
# guard re-validates every hop — a public feed URL can 302 into an internal
# one. A handful of hops covers legitimate canonicalisation (http→https,
# trailing slash, vanity → real host).
_MAX_REDIRECTS: int = 5
_REDIRECT_STATUSES: frozenset[int] = frozenset({301, 302, 303, 307, 308})

# Cap the body we buffer. iCal exports are small text; this bounds memory if a
# user-supplied URL streams a huge response.
_MAX_FEED_BYTES: int = 5_000_000


def _user_agent() -> str:
    base = settings.app_url or "https://mybookkeeper.app"
    return f"MyBookkeeper-iCal-Poller/1.0 ({base})"


async def _fetch(url: str, *, client: httpx.AsyncClient) -> bytes:
    """Fetch a single iCal feed, guarding against SSRF.

    The feed URL is user-supplied (``ical_import_url``), so every hop is
    validated with ``assert_url_safe`` before egress and auto-redirects are
    disabled — a public URL can ``302`` into an internal target (cloud
    metadata, loopback, RFC1918, a sibling service on the Docker network).

    Raises:
        UnsafeURLError: the URL (or a redirect hop) resolves to a non-public
            address, or is not http(s) on a standard web port.
        httpx.HTTPError: transport failure, non-2xx response, too many
            redirects, or a body exceeding ``_MAX_FEED_BYTES``.
    """
    headers = {"User-Agent": _user_agent(), "Accept": "text/calendar"}
    current_url = url
    for _ in range(_MAX_REDIRECTS + 1):
        # SSRF guard — never issue a request to a non-public target.
        await assert_url_safe(current_url)
        response = await client.get(
            current_url,
            timeout=_POLL_TIMEOUT_SECONDS,
            headers=headers,
            follow_redirects=False,
        )
        if response.status_code in _REDIRECT_STATUSES:
            location = response.headers.get("location")
            if not location:
                break  # redirect status with no target — treat as final
            current_url = urljoin(current_url, location)
            continue
        break
    else:
        raise httpx.HTTPError(f"exceeded {_MAX_REDIRECTS} redirects fetching feed")

    response.raise_for_status()
    content = response.content
    if len(content) > _MAX_FEED_BYTES:
        raise httpx.HTTPError(
            f"iCal feed exceeds {_MAX_FEED_BYTES} bytes — refusing to parse"
        )
    return content


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

    category: ImportErrorCategory
    try:
        payload = await _fetch(channel_listing.ical_import_url, client=client)
        parsed = parse_ical_blackouts(payload)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            category = "auth"
        elif 400 <= status < 500:
            category = "config"
        else:
            category = "transient"
        message = f"HTTPStatusError {status}: {exc}"
        logger.warning(
            "iCal poll %s for channel_listing=%s url=%s: %s",
            category, channel_listing.id, channel_listing.ical_import_url, message,
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
    except httpx.RequestError as exc:
        category = "transient"
        message = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "iCal poll transient for channel_listing=%s url=%s: %s",
            channel_listing.id, channel_listing.ical_import_url, message,
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
            "iCal poll blocked unsafe URL for channel_listing=%s url=%s: %s",
            channel_listing.id, channel_listing.ical_import_url, message,
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
            "iCal poll unknown error for channel_listing=%s url=%s",
            channel_listing.id, channel_listing.ical_import_url,
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
    async with httpx.AsyncClient() as client:
        for row in rows:
            await poll_one(row, client=client)
            polled += 1

    return polled
