"""Raid icons — GET /discord/raid-icons/<name>.png.

Public URL:  https://mygamingassistant.myfreeapps.org/api/discord/raid-icons/warrior_fury.png?v=<hash>
FastAPI path: /discord/raid-icons/warrior_fury.png  (Caddy strips the /api prefix)

The raid's web page shows the post's class, spec, role and status icons from
here (``app/services/wow/raid_icon_files.py``).  Public and read-only, like
the banners: the bytes are the bot's committed emoji art, loaded at import
and looked up by exact file name, so nothing else on disk is reachable.
Mounted with the bot (``discord_enabled``); disabled = absent (404).

The page's URLs carry ``ICONS_VERSION`` (``?v=``): the current version is
cached for a year, any other for an hour, as for the banners.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from app.api.discord_raid_banners import versioned_png
from app.services.wow.raid_icon_files import ICONS_VERSION, ROUTE_PREFIX, icon_for_file

router = APIRouter(prefix=ROUTE_PREFIX, tags=["discord"])


@router.get("/{file_name}", response_class=Response, responses={200: {"content": {"image/png": {}}}})
async def get_raid_icon(file_name: str, v: str | None = None) -> Response:
    png = icon_for_file(file_name)
    if png is None:
        raise HTTPException(status_code=404, detail="Not Found")
    return versioned_png(png, current=v == ICONS_VERSION)
