"""Service layer for the unified calendar viewer.

Orchestration only — defaults the window when omitted, validates the
window cap, delegates the joined query to the repository, and maps ORM
rows to the response schema. No SQL here.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, timedelta

from app.core.calendar_constants import DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS
from app.db.session import AsyncSessionLocal
from app.repositories.calendar import calendar_repository
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

    Raises ``CalendarWindowError`` for an invalid or oversize window.
    """
    resolved_from, resolved_to = _resolve_window(from_, to)

    async with AsyncSessionLocal() as db:
        rows = await calendar_repository.query_events(
            db,
            organization_id=organization_id,
            from_=resolved_from,
            to=resolved_to,
            listing_ids=listing_ids,
            property_ids=property_ids,
            sources=sources,
        )

    return [
        CalendarEventResponse(
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
            updated_at=blackout.updated_at,
        )
        for blackout, listing, prop in rows
    ]
