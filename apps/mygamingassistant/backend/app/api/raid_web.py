"""The raid's public web page — GET /wow/raids/{web_id}.

Public URL:  https://mygamingassistant.myfreeapps.org/api/wow/raids/<web_id hex>
FastAPI path: /wow/raids/<web_id>  (Caddy strips the /api prefix)

What the raid's Discord post shows, for the page at
``/wow-forever/raids/<web_id hex>`` (``app/services/wow/raid_web_service.py``).
A capability URL: ``web_id`` is random (0043), there is no list or search and
no guild or user parameter, and a draft is not found.  No auth: anyone with
the link reads what everyone in the raid's channel already sees.

* Unknown or a draft → 404 ``raid_not_found``; not a UUID → 422.  The page
  says "not found" for both.
* A per-IP limit of 120 a minute (``wow-raid-page:<ip>``), as on the item
  reader.
* ``Cache-Control: no-store`` (the roster changes by the minute) and
  ``X-Robots-Tag: noindex``.

Mounted with the bot (``discord_enabled``, ``app/api/discord_public.py``):
its data only exists through the bot.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Final

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from platform_shared.core.request_utils import get_client_ip
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import RateLimiter
from app.db.session import get_db
from app.schemas.wow.raid_web import RaidPage
from app.services.wow import raid_web_service

# Machine-readable detail the page shows as its "not found" panel.
RAID_NOT_FOUND: Final = "raid_not_found"
PAGE_HEADERS: Final = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex"}

raid_page_limiter = RateLimiter(max_attempts=120, window_seconds=60)

router = APIRouter(tags=["wow-raids"])


async def check_raid_page_ip_limit(request: Request) -> None:
    raid_page_limiter.check(f"wow-raid-page:{get_client_ip(request)}")


@router.get("/wow/raids/{web_id}", response_model=RaidPage, dependencies=[Depends(check_raid_page_ip_limit)])
async def get_raid_page(web_id: uuid.UUID, response: Response, db: AsyncSession = Depends(get_db)) -> RaidPage:
    page = await raid_web_service.get_page(db, web_id, datetime.now(timezone.utc))
    if page is None:
        raise HTTPException(status_code=404, detail=RAID_NOT_FOUND, headers=PAGE_HEADERS)
    response.headers.update(PAGE_HEADERS)
    return page
