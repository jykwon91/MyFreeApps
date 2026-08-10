"""Service layer for the unified calendar viewer.

Orchestration only — defaults the window when omitted, validates the window
cap, delegates the joined queries to the repository, and merges the two event
sources (channel/manual blackouts and tenant leases) into one ordered list.
Row-to-schema conversion lives in ``mappers.calendar_event_mapper``. No SQL
here.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, timedelta

from app.core.calendar_constants import (
    DEFAULT_WINDOW_DAYS,
    LEASE_SOURCE,
    MAX_WINDOW_DAYS,
)
from app.db.session import AsyncSessionLocal
from app.mappers.calendar_event_mapper import (
    blackout_to_event,
    event_sort_key,
    lease_to_event,
)
from app.repositories.calendar import calendar_repository
from app.repositories.listings import listing_blackout_attachment_repo
from app.schemas.calendar.calendar_event_response import CalendarEventResponse


class CalendarWindowError(ValueError):
    """Raised when ``from``/``to`` is invalid (inverted, or window > cap)."""


def _resolve_window(from_: date | None, to: date | None) -> tuple[date, date]:
    """Apply defaults + validate the window.

    - If both are omitted: today → today + ``DEFAULT_WINDOW_DAYS``.
    - If only one is supplied: anchor the other off it using the default
      window length so partial requests still get a sane result.
    - ``from`` must be strictly before ``to`` (zero-day windows return
      nothing useful and are almost certainly a caller bug).
    - The window must not exceed ``MAX_WINDOW_DAYS``.
    """
    if from_ is None and to is None:
        from_ = date.today()
        to = from_ + timedelta(days=DEFAULT_WINDOW_DAYS)
    elif from_ is None:
        assert to is not None
        from_ = to - timedelta(days=DEFAULT_WINDOW_DAYS)
    elif to is None:
        to = from_ + timedelta(days=DEFAULT_WINDOW_DAYS)

    if from_ >= to:
        raise CalendarWindowError("`from` must be strictly before `to`")

    if (to - from_).days > MAX_WINDOW_DAYS:
        raise CalendarWindowError(
            f"Window exceeds {MAX_WINDOW_DAYS} days; narrow the range",
        )

    return from_, to


def _blackout_sources(sources: Sequence[str] | None) -> tuple[list[str] | None, bool]:
    """Split a ``sources`` filter into its blackout half.

    Returns the slugs to pass to the blackout query and whether to run it at
    all. ``lease`` is stripped because no blackout carries that source — left
    in, a "leases only" filter would still scan the blackout table and a
    "lease + airbnb" filter would read as if lease were a channel.
    """
    if not sources:
        return None, True
    channel_slugs = [s for s in sources if s != LEASE_SOURCE]
    return channel_slugs, bool(channel_slugs)


async def list_events(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    *,
    from_: date | None = None,
    to: date | None = None,
    listing_ids: Sequence[uuid.UUID] | None = None,
    property_ids: Sequence[uuid.UUID] | None = None,
    sources: Sequence[str] | None = None,
) -> list[CalendarEventResponse]:
    """Return calendar events for the active organization.

    Unions two sources: channel/manual blackouts and tenant occupancy derived
    from signed leases. Both honour the same window and listing/property
    filters; ``sources`` selects between them.

    Raises ``CalendarWindowError`` for an invalid or oversize window.
    """
    resolved_from, resolved_to = _resolve_window(from_, to)
    channel_slugs, want_blackouts = _blackout_sources(sources)
    want_leases = not sources or LEASE_SOURCE in sources

    events: list[CalendarEventResponse] = []

    async with AsyncSessionLocal() as db:
        if want_blackouts:
            rows = await calendar_repository.query_events(
                db,
                organization_id=organization_id,
                from_=resolved_from,
                to=resolved_to,
                listing_ids=listing_ids,
                property_ids=property_ids,
                sources=channel_slugs,
            )

            # Batch-load attachment counts in one round-trip to avoid N+1.
            blackout_ids = [blackout.id for blackout, _listing, _prop in rows]
            counts = await listing_blackout_attachment_repo.count_by_blackout_ids(
                db, blackout_ids,
            )
            events.extend(
                blackout_to_event(blackout, listing, prop, counts.get(blackout.id, 0))
                for blackout, listing, prop in rows
            )

        if want_leases:
            lease_rows = await calendar_repository.query_lease_events(
                db,
                organization_id=organization_id,
                from_=resolved_from,
                to=resolved_to,
                listing_ids=listing_ids,
                property_ids=property_ids,
            )
            events.extend(
                lease_to_event(lease, listing, prop, applicant)
                for lease, listing, prop, applicant in lease_rows
            )

    events.sort(key=event_sort_key)
    return events
