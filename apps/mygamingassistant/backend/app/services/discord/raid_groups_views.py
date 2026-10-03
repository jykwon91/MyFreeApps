"""Raid: Edit's [Groups] and the post's [Groups] — pure builders.

* :func:`groups_button` ends row 2 of Raid: Edit's card (``gp:plan``): the
  leader's way into the group planner.
* :func:`planner_link_reply` answers it privately, with [Open group planner]:
  a link to ``…/raids/<hex>/plan#k=<token>`` that only this leader holds
  (``raid_web_links.plan_page_url``).
* :func:`groups_reply` answers the post's [Groups] (``gp:view``, there while
  the leader shares the groups), privately: a field per group, its players
  in slot order as the roster shows them, how many seated players have no
  group yet, and [Open in browser] to the raid's page at its groups.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final

from platform_shared.services.discord import BUTTON_STYLE_SECONDARY, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_groups_copy
from app.services.discord.interaction import ephemeral_response
from app.services.discord.raid_views import action_row, button
from app.services.wow import raid_custom_id
from app.services.wow.raid_embed import post_color, roster_entry
from app.services.wow.raid_groups import groups_view
from app.services.wow.raid_post_buttons import link_button
from app.services.wow.raid_text import title_text
from app.services.wow.raid_web_links import raid_page_url

# The raid page's groups section (``FE/components/raid/RaidGroupsView.tsx``).
GROUPS_ANCHOR: Final = "#groups"


def groups_button(event: WowRaidEvent) -> dict[str, Any]:
    """[Groups] on Raid: Edit — a planner link for the leader (``components/raid_groups``)."""
    return button(raid_groups_copy.BUTTON, BUTTON_STYLE_SECONDARY, raid_custom_id.encode("gp", event.id, "plan"))


def planner_link_reply(event: WowRaidEvent, url: str, expires_at: datetime) -> dict[str, Any]:
    """Whose link it is and when it stops working, over [Open group planner]; Raid: Edit's card stays."""
    text = raid_groups_copy.planner_link_text(title_text(event), expires_at)
    planner = link_button(raid_groups_copy.OPEN_PLANNER, url, None)
    return ephemeral_response(text, components=[action_row(planner)])


def groups_reply(event: WowRaidEvent, signups: Sequence[WowRaidSignup], emojis: EmojiSet) -> dict[str, Any]:
    """The groups the leader shares: a field per group with anyone in it, then who has no group yet."""
    view = groups_view(event, signups)
    fields = [
        {
            "name": raid_groups_copy.group_name(group.number),
            "value": "\n".join(roster_entry(signup, None, emojis) for signup in group.members),
            "inline": True,
        }
        for group in view.groups
    ]
    lines: list[str] = []
    if not fields:
        lines.append(raid_groups_copy.NOBODY_PLACED)
    if view.unplaced:
        lines.append(raid_groups_copy.unplaced_line(view.unplaced))
    embed: dict[str, Any] = {
        "title": raid_groups_copy.groups_title(title_text(event)),
        "color": post_color(event),
        "fields": fields,
    }
    if lines:
        embed["description"] = "\n".join(lines)
    components: list[dict[str, Any]] = []
    page = raid_page_url(event)
    if page is not None:
        browser = link_button(raid_groups_copy.OPEN_IN_BROWSER, f"{page}{GROUPS_ANCHOR}", None)
        components.append(action_row(browser))
    return ephemeral_response("", components=components, embeds=[embed])
