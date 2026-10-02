"""Raid: Manage's raid picker: which raid to manage a player on, when the leader leads several.

A right-click on a member opens their card on the one raid its leader
leads; with more, this menu comes first.  Each raid in it says where the
player stands on it.  A pick opens their card on that raid.
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from typing import Any, Final

from platform_shared.services.discord import COMPONENT_TYPE_STRING_SELECT

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_manage_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_manage_views import Target, listed_signup, player_embed, roster_description, signup_of
from app.services.discord.raid_views import action_row, event_choice_label
from app.services.wow.raid_custom_id import RAID_PICK, encode
from app.services.wow.raid_roster import ABSENCE_STATUS

# A select menu holds 25 options: the raids starting soonest.
PICK_RAIDS: Final = 25


def raid_pick_data(
    target: Target,
    events: Sequence[WowRaidEvent],
    signups: Mapping[uuid.UUID, Sequence[WowRaidSignup]],
    tz_name: str,
) -> dict[str, Any]:
    """The player on top, then a menu of *events* (each valued '<event>:<member>')."""
    options = []
    for event in events[:PICK_RAIDS]:
        option = {"label": event_choice_label(event, tz_name), "value": f"{event.id}:{target.user_id}"}
        description = _standing(target.user_id, signups.get(event.id, ()))
        if description is not None:
            option["description"] = description
        options.append(option)
    select = {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": encode(RAID_PICK),
        "placeholder": raid_manage_copy.PICK_RAID,
        "min_values": 1,
        "max_values": 1,
        "options": options,
    }
    embed = player_embed(target, raid_manage_copy.raid_pick_prompt(target.who))
    return ephemeral_data("", components=[action_row(select)], embeds=[embed])


def _standing(user_id: str, signups: Sequence[WowRaidSignup]) -> str | None:
    """'Not signed up', 'Marked absent', or their spec and status ('Fury Warrior · late')."""
    mine = listed_signup(signups, user_id)
    if mine is not None:
        return roster_description(mine, signups)
    theirs = signup_of(signups, user_id)
    if theirs is not None and theirs.status == ABSENCE_STATUS:
        return raid_manage_copy.MARKED_ABSENT
    return raid_manage_copy.NOT_SIGNED_UP
