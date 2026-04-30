"""Public, unauthenticated outbound iCal endpoint.

The route exposes one URL: ``GET /api/calendar/{token}.ics``. Channels
poll this URL without credentials; the token (~32 url-safe chars,
``secrets.token_urlsafe(24)``) is the sole secret. A bad token returns
404 — same as a real miss — so an attacker cannot distinguish "wrong
token" from "valid token format but no such row".
"""
from fastapi import APIRouter, HTTPException, Response

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
