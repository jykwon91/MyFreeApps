"""Raid post banners — GET /discord/raid-banners/<raid key>.png.

Public URL:  https://mygamingassistant.myfreeapps.org/api/discord/raid-banners/onyxia.png?v=<hash>
FastAPI path: /discord/raid-banners/onyxia.png  (Caddy strips the /api prefix)

Discord's media proxy fetches these for the raid posts' embeds (see
``app/services/wow/raid_banners.py``).  Public and read-only: the bytes are
our committed art, loaded at import, looked up by exact file name — nothing
else on disk is reachable.  Mounted with the bot (``discord_enabled``);
disabled = absent (404).

The post's URL carries the image's hash (``?v=``), so a response for the
current hash never changes and is cached for a year.  Any other ``v`` (an
old post, a hand-typed URL) gets an hour: new art reaches it soon.
"""
from __future__ import annotations

from typing import Final

from fastapi import APIRouter, HTTPException, Response

from app.services.wow.raid_banners import ROUTE_PREFIX, banner_for_file

_CACHE_CURRENT: Final = "public, max-age=31536000, immutable"
_CACHE_OTHER: Final = "public, max-age=3600"

router = APIRouter(prefix=ROUTE_PREFIX, tags=["discord"])


@router.get("/{file_name}")
async def get_raid_banner(file_name: str, v: str | None = None) -> Response:
    banner = banner_for_file(file_name)
    if banner is None:
        raise HTTPException(status_code=404, detail="Not Found")
    cache = _CACHE_CURRENT if v == banner.version else _CACHE_OTHER
    return Response(content=banner.png, media_type="image/png", headers={"Cache-Control": cache})
