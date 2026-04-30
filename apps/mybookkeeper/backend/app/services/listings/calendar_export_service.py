"""Service for serving outbound iCal feeds.

Public, unauthenticated. The token in the URL is the sole secret —
``secrets.token_urlsafe(24)`` random bytes (~192 bits of entropy) is
sufficient that we don't need rate limiting for this endpoint.

A miss returns ``None`` so the route can return 404 — never 401/403
(no existence leak through status code differences).
"""
from __future__ import annotations

from app.db.session import AsyncSessionLocal
from app.repositories import channel_listing_repo, listing_blackout_repo
from app.services.listings.ical_serializer import serialize_blackouts


async def render_ical_for_token(token: str) -> bytes | None:
    """Look up a channel_listing by its outbound token and serialize its
    parent listing's blackouts as iCal bytes.

    Returns ``None`` if the token is not found. The blackouts list
    deliberately includes ALL sources (manual + every channel) so a
    block on ANY channel propagates everywhere — that's the entire
    point of this PR.
    """
    async with AsyncSessionLocal() as db:
        channel_listing = await channel_listing_repo.get_by_export_token(db, token)
        if channel_listing is None:
            return None

        blackouts = await listing_blackout_repo.list_by_listing(
            db, channel_listing.listing_id,
        )
        return serialize_blackouts(str(channel_listing.listing_id), blackouts)
