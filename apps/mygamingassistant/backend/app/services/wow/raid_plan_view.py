"""A raid's group planner — a PURE function of (event, signups); no I/O, the clock passed in.

``RaidPlan`` for the leader's planner (``FE/pages/WowRaidPlannerPage.tsx``):
the raid's seated players in line order, each as the post shows them
(``raid_web_view.page_entry``), with their place in the groups
(``raid_groups.live_assignments``) and their note while the raid takes
notes.  Nobody without a seat: the groups are the raid's seats.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.schemas.wow.raid_plan import PlanPlayer, RaidPlan
from app.services.wow.raid_groups import group_count, live_assignments
from app.services.wow.raid_icon_files import ICONS_VERSION
from app.services.wow.raid_roster import SEAT_STATUSES, in_line_order, order_numbers
from app.services.wow.raid_text import display_title
from app.services.wow.raid_web_view import page_entry, page_state


def build_plan(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], *, link_expires_at: datetime, now: datetime
) -> RaidPlan:
    """The planner of a posted raid, for a link that works until *link_expires_at*."""
    live = live_assignments(event, signups)
    numbers = order_numbers(signups)
    players: list[PlanPlayer] = []
    for signup in in_line_order(signups):
        if signup.status not in SEAT_STATUSES:
            continue
        player = PlanPlayer(**page_entry(signup, numbers.get(signup.discord_user_id)).model_dump(exclude={"queued"}))
        if event.signup_notes_enabled:
            player.note = signup.note
        place = live.get(signup.id)
        if place is not None:
            player.group, player.slot = place
        players.append(player)
    return RaidPlan(
        web_id=event.web_id,
        title=display_title(event),
        starts_at=event.starts_at,
        state=page_state(event, now),
        size_cap=event.size_cap,
        group_count=group_count(event.size_cap),
        version=event.groups_version,
        published=event.groups_published_at is not None,
        updated_at=event.groups_updated_at,
        link_expires_at=link_expires_at,
        notes_enabled=bool(event.signup_notes_enabled),
        icons_version=ICONS_VERSION,
        players=players,
    )
