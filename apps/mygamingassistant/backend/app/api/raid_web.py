"""The raid's public web page — GET /wow/raids/{web_id} — and its group planner (…/plan).

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

The group planner (``GET`` / ``PUT /wow/raids/{web_id}/plan``, page
``/wow-forever/raids/<hex>/plan``) takes ``Authorization: RaidPlanner
<token>``: the leader's 2-hour link from Raid: Edit → [Groups]
(``raid_plan_links``).

* No link, another scheme, a wrong token or another raid's → 403
  ``plan_link_invalid``; a link past its two hours → 403
  ``plan_link_expired``.  Never 401: the shared client reads 401 as "logged
  out".
* A save can also be refused: 409 ``groups_changed`` (someone saved since)
  or ``raid_over`` (cancelled or completed), 422 ``invalid_plan``.  A save
  that shares or hides the groups re-renders the post in the background:
  [Groups] comes or goes.
* A per-IP limit of 60 a minute (``wow-raid-plan:<ip>``); the same headers.

Mounted with the bot (``discord_enabled``, ``app/api/discord_public.py``):
its data only exists through the bot.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Final

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, Response
from platform_shared.core.request_utils import get_client_ip
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import RateLimiter
from app.db.session import get_db
from app.schemas.wow.raid_plan import RaidPlan, RaidPlanSave, RaidPlanSaved
from app.schemas.wow.raid_web import RaidPage
from app.services.discord import raid_publisher
from app.services.wow import raid_plan_links, raid_plan_service, raid_web_service
from app.services.wow.raid_groups import INVALID_PLAN
from app.services.wow.raid_plan_links import PLAN_LINK_EXPIRED, PLAN_LINK_INVALID, RAID_NOT_FOUND
from app.services.wow.raid_plan_service import GROUPS_CHANGED, RAID_OVER

PAGE_HEADERS: Final = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex"}
# A planner refusal's status; its detail is the reason.
_REFUSAL_STATUS: Final[dict[str, int]] = {
    RAID_NOT_FOUND: 404,
    PLAN_LINK_INVALID: 403,
    PLAN_LINK_EXPIRED: 403,
    GROUPS_CHANGED: 409,
    RAID_OVER: 409,
    INVALID_PLAN: 422,
}

raid_page_limiter = RateLimiter(max_attempts=120, window_seconds=60)
raid_plan_limiter = RateLimiter(max_attempts=60, window_seconds=60)

router = APIRouter(tags=["wow-raids"])


async def check_raid_page_ip_limit(request: Request) -> None:
    raid_page_limiter.check(f"wow-raid-page:{get_client_ip(request)}")


async def check_raid_plan_ip_limit(request: Request) -> None:
    raid_plan_limiter.check(f"wow-raid-plan:{get_client_ip(request)}")


@router.get("/wow/raids/{web_id}", response_model=RaidPage, dependencies=[Depends(check_raid_page_ip_limit)])
async def get_raid_page(web_id: uuid.UUID, response: Response, db: AsyncSession = Depends(get_db)) -> RaidPage:
    page = await raid_web_service.get_page(db, web_id, datetime.now(timezone.utc))
    if page is None:
        raise HTTPException(status_code=404, detail=RAID_NOT_FOUND, headers=PAGE_HEADERS)
    response.headers.update(PAGE_HEADERS)
    return page


@router.get("/wow/raids/{web_id}/plan", response_model=RaidPlan, dependencies=[Depends(check_raid_plan_ip_limit)])
async def get_raid_plan(
    web_id: uuid.UUID,
    response: Response,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> RaidPlan:
    now = datetime.now(timezone.utc)
    access = await raid_plan_links.resolve(db, web_id, authorization, now)
    if isinstance(access, str):
        raise _refused(access)
    response.headers.update(PAGE_HEADERS)
    return await raid_plan_service.get_plan(db, access, now)


@router.put("/wow/raids/{web_id}/plan", response_model=RaidPlanSaved, dependencies=[Depends(check_raid_plan_ip_limit)])
async def save_raid_plan(
    web_id: uuid.UUID,
    body: RaidPlanSave,
    response: Response,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> RaidPlanSaved:
    now = datetime.now(timezone.utc)
    access = await raid_plan_links.resolve(db, web_id, authorization, now)
    if isinstance(access, str):
        raise _refused(access)
    outcome = await raid_plan_service.save_plan(db, access, body, now)
    if isinstance(outcome, str):
        raise _refused(outcome)
    await db.commit()
    if outcome.visibility_changed:
        background.add_task(raid_publisher.refresh_public_message, access.event.id)
    response.headers.update(PAGE_HEADERS)
    return RaidPlanSaved(plan=outcome.plan, dropped=outcome.dropped_names)


def _refused(reason: str) -> HTTPException:
    return HTTPException(status_code=_REFUSAL_STATUS[reason], detail=reason, headers=PAGE_HEADERS)
