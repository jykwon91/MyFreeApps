"""What the raid bot says about a raid's groups: Raid: Edit's [Groups] and the post's [Groups].

Raid: Edit's [Groups] hands the leader a link to the group planner in the
browser (``components/raid_groups``); the post's [Groups] lists the groups
the leader shares (``raid_groups_views``).
"""
from __future__ import annotations

from datetime import datetime
from typing import Final

from app.services.discord.raid_views import unix

BUTTON: Final = "Groups"
OPEN_PLANNER: Final = "Open group planner"
OPEN_IN_BROWSER: Final = "Open in browser"
NOT_LEADER: Final = "Only the raid's leader or someone with Manage Events can plan groups."
RAID_OVER: Final = "This raid is over."
NO_HTTPS: Final = "The group planner needs the site's public https address."
NOT_SHARED: Final = "The leader isn't sharing groups for this raid right now."
NOBODY_PLACED: Final = "Nobody is in a group yet."


def planner_link_text(title: str, expires_at: datetime) -> str:
    """The reply under [Open group planner]: whose link it is and when it stops working."""
    return (
        f"Plan **{title}**'s groups in your browser. "
        f"This link is only for you and stops working <t:{unix(expires_at)}:R>."
    )


def groups_title(title: str) -> str:
    return f"Groups — {title}"


def group_name(number: int) -> str:
    return f"Group {number}"


def unplaced_line(count: int) -> str:
    """'Not in a group yet: 3 seated players'."""
    players = "players"
    if count == 1:
        players = "player"
    return f"Not in a group yet: {count} seated {players}"
