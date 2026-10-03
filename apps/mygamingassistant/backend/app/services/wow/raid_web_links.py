"""The raid's public web page: its address, for the post's [Web view]; and its group planner's.

A raid's page is ``{origin}/wow-forever/raids/<web_id hex>`` on the site
(``FE/pages/WowRaidPage.tsx``), read through ``GET /wow/raids/{web_id}``
(``app/api/raid_web.py``).  ``web_id`` is a random id of its own (0043):
anyone with the link can see the page, and nobody can find it without one.

The leader's group planner is ``…/raids/<hex>/plan``
(``FE/pages/WowRaidPlannerPage.tsx``), its key in the fragment
(:func:`plan_page_url`).

Links go out only from a public https origin (``settings.frontend_url``),
which means production, the same rule as the banners.  Local dev and tests
post without them.  A draft has no page.
"""
from __future__ import annotations

from typing import Final

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent

PAGE_PATH: Final = "/wow-forever/raids"
PLAN_PATH: Final = "/plan"


def public_origin() -> str | None:
    """The site's public origin ("https://…", no trailing slash); None unless it's https."""
    origin = settings.frontend_url.rstrip("/")
    if not origin.startswith("https://"):
        return None
    return origin


def raid_page_path(event: WowRaidEvent) -> str:
    """The page's path on the site: ``/wow-forever/raids/<hex>``."""
    return f"{PAGE_PATH}/{event.web_id.hex}"


def raid_page_url(event: WowRaidEvent) -> str | None:
    """The raid's page, for its post; None for a draft or without a public https origin."""
    origin = public_origin()
    if origin is None or event.status == "draft":
        return None
    return f"{origin}{raid_page_path(event)}"


def plan_page_url(page: str, token: str) -> str:
    """The group planner of the raid whose page is *page* (``raid_page_url``), opened with *token*.

    The token rides in the fragment (``#k=``), which browsers never send: no
    server, access log or Referer sees it.
    """
    return f"{page}{PLAN_PATH}#k={token}"
