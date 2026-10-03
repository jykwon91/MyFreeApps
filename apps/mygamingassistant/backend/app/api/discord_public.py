"""Everything the raid bot serves in public, as one router — mounted only with the bot.

``app.main`` includes it when ``discord_enabled=True``; disabled = absent
(404), not present-but-broken.  The raid data only exists through the bot,
so the raid's web page lives and dies with it.

* ``POST /discord/interactions``: Discord's calls (Ed25519-gated);
* ``GET /discord/raid-banners/<raid key>.png``: the posts' banner art;
* ``GET /discord/raid-icons/<name>.png``: the web page's icons;
* ``GET /wow/raids/<web_id>``: the raid's web page.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.api import discord_interactions, discord_raid_banners, discord_raid_icons, raid_web

router = APIRouter()
router.include_router(discord_interactions.router)
router.include_router(discord_raid_banners.router)
router.include_router(discord_raid_icons.router)
router.include_router(raid_web.router)
