"""Calendar endpoints.

Two routers live here:

1. ``router`` — the unauthenticated outbound iCal feed at
   ``GET /calendar/{token}.ics``. Channels poll this URL without
   credentials; the token is the sole secret. A bad token returns 404.

2. ``events_router`` — the authenticated unified calendar viewer at
   ``GET /calendar/events``. Returns every blackout across every listing
   in the active organization, joined with its parent listing + property.
   Used by the in-app ``/calendar`` page.

The two routers share a path prefix (``/calendar``) but have completely
different access patterns — keeping them separate makes the auth/rate-limit
intent obvious at registration time.
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.calendar.calendar_event_response import CalendarEventResponse
from app.services.calendar import calendar_service
from app.services.listings.calendar_export_service import render_ical_for_token

# Caddy strips ``/api`` before forwarding to FastAPI, and the Vite dev proxy
# does the same. So this router lives at root — channels polling the
# public URL ``https://<host>/api/calendar/<token>.ics`` end up hitting
# ``GET /calendar/<token>.ics`` here.
router = APIRouter(tags=["calendar"])


@router.get(
    "/calendar/{token}.ics",
    response_class=Response,
    responses={
        200: {"content": {"text/calendar": {}}},
        404: {"description": "Token not found"},
    },
)
async def get_ical_feed(token: str) -> Response:
    """Serve the iCalendar feed for the channel_listing identified by ``token``.

    ``Cache-Control: no-store`` because the calendar can change at any
    moment — a poll five minutes from now must see fresh data. Channels
    re-poll on their own schedule (typically 1–4 hours), so the
    bandwidth cost is negligible.
    """
    payload = await render_ical_for_token(token)
    if payload is None:
        # Same response shape as a real 404. Never 401/403 — no token-
        # existence leak through status code differences.
        raise HTTPException(status_code=404, detail="Not found")

    return Response(
        content=payload,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": "inline; filename=calendar.ics",
        },
    )


# ---------------------------------------------------------------------------
# Authenticated unified-calendar viewer
# ---------------------------------------------------------------------------

events_router = APIRouter(prefix="/calendar", tags=["calendar"])


def _parse_uuid_csv(raw: str | None, *, field: str) -> list[uuid.UUID] | None:
    """Parse a comma-separated UUID list, raising 400 on bad input."""
    if not raw:
        return None
    out: list[uuid.UUID] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            out.append(uuid.UUID(token))
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid UUID in `{field}`: {token}",
            ) from exc
    return out or None


def _parse_str_csv(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    items = [s.strip() for s in raw.split(",") if s.strip()]
    return items or None


@events_router.get("/events", response_model=list[CalendarEventResponse])
async def list_calendar_events(
    from_: date | None = Query(None, alias="from", description="ISO date, inclusive"),
    to: date | None = Query(None, description="ISO date, exclusive"),
    listing_ids: str | None = Query(None, description="Comma-separated listing UUIDs"),
    property_ids: str | None = Query(None, description="Comma-separated property UUIDs"),
    sources: str | None = Query(None, description="Comma-separated source slugs"),
    ctx: RequestContext = Depends(current_org_member),
) -> list[CalendarEventResponse]:
    """Return blackout events for the active organization.

    Filters compose with AND across categories (a listing must match the
    ``listing_ids`` filter AND the ``sources`` filter to appear). Within
    a category, items are OR'd (any listing in the CSV qualifies).

    Raises 400 on malformed UUIDs and 422 on oversize windows.
    """
    parsed_listing_ids = _parse_uuid_csv(listing_ids, field="listing_ids")
    parsed_property_ids = _parse_uuid_csv(property_ids, field="property_ids")
    parsed_sources = _parse_str_csv(sources)

    try:
        return await calendar_service.list_events(
            ctx.organization_id,
            ctx.user_id,
            from_=from_,
            to=to,
            listing_ids=parsed_listing_ids,
            property_ids=parsed_property_ids,
            sources=parsed_sources,
        )
    except calendar_service.CalendarWindowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
