"""The group planner's read and save: ``GET`` / ``PUT /wow/raids/{web_id}/plan``.

Every call comes with a working link (``raid_plan_links.resolve``): the raid
and whose link it is.  A save locks the raid first, as every sign-up write
does, so who has a seat can't change under it, then refuses, in order:

* ``raid_over`` — the raid is cancelled or completed (its groups are history);
* ``groups_changed`` — someone saved since this plan was loaded (its version);
* ``invalid_plan`` — the plan doesn't fit the raid (``raid_groups.check_plan``).

Otherwise the plan replaces the raid's groups, committed through the
repository (``commit_plan_save``): players who lost their seat
meanwhile are left out and named back.  Publishing stamps
``groups_published_at`` the first time, unpublishing clears it, and a plain
save keeps it.  Only a change of who sees the groups touches the post
(``visibility_changed``).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_event_repo, wow_raid_plan_repo, wow_raid_signup_repo
from app.schemas.wow.raid_plan import RaidPlan, RaidPlanSave
from app.services.wow.raid_groups import Placement, check_plan
from app.services.wow.raid_plan_links import RAID_NOT_FOUND, PlanAccess
from app.services.wow.raid_plan_view import build_plan
from app.services.wow.raid_text import shown_name

logger = logging.getLogger(__name__)

RAID_OVER: Final = "raid_over"
GROUPS_CHANGED: Final = "groups_changed"
# A raid whose groups can't change any more.
_OVER: Final = ("cancelled", "completed")


@dataclass(frozen=True)
class SaveOutcome:
    """A save: the groups as saved, who was left out, and whether raiders' view of them changed."""

    plan: RaidPlan
    dropped_names: list[str]
    visibility_changed: bool


async def get_plan(db: AsyncSession, access: PlanAccess, now: datetime) -> RaidPlan:
    """The raid's groups and seated players, for the planner."""
    signups = await wow_raid_signup_repo.list_for_event(db, access.event.id)
    return build_plan(access.event, signups, link_expires_at=access.expires_at, now=now)


async def save_plan(db: AsyncSession, access: PlanAccess, body: RaidPlanSave, now: datetime) -> SaveOutcome | str:
    """Make *body* the raid's groups, under its row lock; else why not (see the module)."""
    event = await wow_raid_event_repo.get_for_update(db, access.event.id)
    if event is None:
        return RAID_NOT_FOUND
    if event.status in _OVER:
        return RAID_OVER
    if body.version != event.groups_version:
        return GROUPS_CHANGED
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    placements = [Placement(signup_id=a.signup_id, group=a.group, slot=a.slot) for a in body.assignments]
    check = check_plan(event, signups, placements)
    if check.error is not None:
        return check.error
    was_published = event.groups_published_at is not None
    rows = [(placement.signup_id, placement.group, placement.slot) for placement in check.valid]
    signups = await wow_raid_plan_repo.replace_assignments(db, event.id, rows)
    published_at = _published_at(event, body.published, now)
    await wow_raid_plan_repo.set_groups_state(db, event, published_at=published_at, now=now)
    await wow_raid_plan_repo.commit_plan_save(db)
    logger.info(
        "Raid groups saved: event_id=%s user=%s version=%d placed=%d dropped=%d published=%s",
        event.id,
        access.discord_user_id,
        event.groups_version,
        len(check.valid),
        len(check.dropped),
        body.published,
    )
    return SaveOutcome(
        plan=build_plan(event, signups, link_expires_at=access.expires_at, now=now),
        dropped_names=[shown_name(signup) for signup in check.dropped],
        visibility_changed=was_published != body.published,
    )


def _published_at(event: WowRaidEvent, published: bool, now: datetime) -> datetime | None:
    """Shared since the first save that shared them; None once hidden."""
    if not published:
        return None
    if event.groups_published_at is not None:
        return event.groups_published_at
    return now
