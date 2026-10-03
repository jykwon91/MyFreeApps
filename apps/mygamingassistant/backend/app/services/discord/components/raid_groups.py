"""Raid: Edit's [Groups] (``gp:plan``) and the post's [Groups] (``gp:view``).

Both answer with a new private message (type 4): Raid: Edit's card stays
where it is, and the post is never touched.

* ``plan`` — the raid's leader, or anyone with Manage Events
  (``raid_context.may_lead``), on a raid still to come, from a site with a
  public https address: a new 2-hour link to the group planner
  (``raid_plan_links.mint``, which ends this leader's previous one).
* ``view`` — anyone: the groups while the leader shares them; a post not
  re-rendered since they stopped says so.
"""
from __future__ import annotations

from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_groups_copy
from app.services.discord.interaction import Interaction, ephemeral_response
from app.services.discord.raid_context import load_event, may_lead, utcnow
from app.services.discord.raid_groups_views import groups_reply, planner_link_reply
from app.services.wow import raid_plan_links
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_plan_links import PLAN_LINK_TTL
from app.services.wow.raid_web_links import plan_page_url, raid_page_url

# A raid with a post: a draft has no groups.
_POSTED: Final = ("scheduled", "cancelled", "completed")
# A raid whose groups are history.
_OVER: Final = ("cancelled", "completed")


async def handle(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Groups]: the planner link for its leader (``plan``), or the shared groups for anyone (``view``)."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False, statuses=_POSTED)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        if parsed.args[0] == "view":
            return await _view(db, context.event)
        return await _plan(db, interaction, context.event)


async def _plan(db: AsyncSession, interaction: Interaction, event: WowRaidEvent) -> dict[str, Any]:
    """A planner link for this leader, or why not: someone else's raid, a raid that's over, no https."""
    if not may_lead(interaction, event):
        return ephemeral_response(raid_groups_copy.NOT_LEADER)
    if event.status in _OVER:
        return ephemeral_response(raid_groups_copy.RAID_OVER)
    page = raid_page_url(event)
    if page is None:
        return ephemeral_response(raid_groups_copy.NO_HTTPS)
    now = utcnow()
    token = await raid_plan_links.mint(db, event, interaction.user_id, now)
    return planner_link_reply(event, plan_page_url(page, token), now + PLAN_LINK_TTL)


async def _view(db: AsyncSession, event: WowRaidEvent) -> dict[str, Any]:
    """The groups the leader shares; the leader no longer sharing them, from a post not re-rendered since."""
    if event.groups_published_at is None:
        return ephemeral_response(raid_groups_copy.NOT_SHARED)
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    return groups_reply(event, signups, emojis.current())
