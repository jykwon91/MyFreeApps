"""Manage sign-ups — a seat on a full raid, which a seat holder gives up — pure builders.

On a full raid, [Seat] on the card of a player without one (tentative,
benched or queued) opens the menu of seat holders: confirmed and late, in
line order, numbered as on the post, 25 to a page.  Picking one is the swap
review: [Swap and tell them] / [Swap quietly] / [Swap and say why], or just
[Swap].  The swap seats the player at the holder's number and benches the
holder, so nobody moves up.  The menu's [Queue them instead] (not for a
player queued already) is the review of a place in the queue.

Every card is the player's (:func:`card_data`), so the next tap reads their
name back off it.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from platform_shared.services.discord import BUTTON_STYLE_PRIMARY, BUTTON_STYLE_SECONDARY, COMPONENT_TYPE_STRING_SELECT

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_manage_copy
from app.services.discord.interaction import UNKNOWN_PLAYER
from app.services.discord.raid_manage_views import (
    ROSTER_PAGE,
    Reach,
    Target,
    back_to_player,
    card_data,
    over_limit,
    pager,
    signed_up_option,
    spec_label,
)
from app.services.discord.raid_views import action_row, button
from app.services.wow.raid_custom_id import MANAGE_MAX_PAGE, manage
from app.services.wow.raid_limits import LimitHit
from app.services.wow.raid_note import shown_note
from app.services.wow.raid_roster import QUEUED_STATUS, SEAT_STATUSES, in_line_order, order_numbers
from app.services.wow.raid_text import escape_note


def seat_holders(signups: Sequence[WowRaidSignup]) -> list[WowRaidSignup]:
    """Who holds a seat (confirmed or late), in line order: whom the menu offers to bench."""
    return in_line_order(s for s in signups if s.status in SEAT_STATUSES)


def holder_target(holder: WowRaidSignup) -> Target:
    """The seat holder as the swap names them: their sign-up's name, or a mention for a nameless one."""
    name = holder.display_name
    if name == UNKNOWN_PLAYER:
        name = None
    return Target(holder.discord_user_id, name)


def swap_limit(
    event: WowRaidEvent, signup: WowRaidSignup, holder: WowRaidSignup, signups: Sequence[WowRaidSignup]
) -> LimitHit | None:
    """The limit seating the player goes over, counted with *holder* off the line (the swap benches them)."""
    others = [s for s in signups if s.discord_user_id != holder.discord_user_id]
    return over_limit(event, signup, "confirmed", others)


def back_to_holders(event: WowRaidEvent, user_id: str) -> dict[str, Any]:
    """[Back] to the holder menu's first page."""
    return button("Back", BUTTON_STYLE_SECONDARY, manage(event.id, "hold", user_id, "1"))


def holders_data(
    event: WowRaidEvent,
    target: Target,
    signup: WowRaidSignup,
    label: str,
    signups: Sequence[WowRaidSignup],
    *,
    page: int = 1,
    notice: str | None = None,
) -> dict[str, Any]:
    """Who goes to the bench to seat the player (as *label*): the seat holders at *page* (kept in range).

    Then [Previous] [Next] past 25 holders, [Queue them instead] unless
    they're queued already, and [Back] to their card.
    """
    uid = target.user_id
    holders = seat_holders(signups)
    pages = min(max(math.ceil(len(holders) / ROSTER_PAGE), 1), MANAGE_MAX_PAGE)
    page = min(max(page, 1), pages)
    text = "\n".join([raid_manage_copy.holders_prompt(target.who, label), raid_manage_copy.RAISE_INSTEAD])
    buttons: list[dict[str, Any]] = []
    if pages > 1:
        buttons = pager(event, page, pages, verb="hold", member=uid)
    if signup.status != QUEUED_STATUS:
        buttons.append(button(raid_manage_copy.QUEUE_INSTEAD, BUTTON_STYLE_SECONDARY, manage(event.id, "queue", uid)))
    buttons.append(back_to_player(event, uid))
    rows = [action_row(_holder_select(event, uid, holders, signups, page)), action_row(*buttons)]
    return card_data(event, target, text, rows, notice=notice)


def _holder_select(
    event: WowRaidEvent, user_id: str, holders: Sequence[WowRaidSignup], signups: Sequence[WowRaidSignup], page: int
) -> dict[str, Any]:
    """*page* of the seat holders, as the hub lists them; the placeholder says which part of a longer list it is."""
    first = (page - 1) * ROSTER_PAGE
    shown = holders[first : first + ROSTER_PAGE]
    placeholder = raid_manage_copy.PICK_HOLDER
    if len(holders) > ROSTER_PAGE:
        placeholder = raid_manage_copy.holder_page(first + 1, first + len(shown), len(holders))
    numbers = order_numbers(signups)
    return {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": manage(event.id, "swap", user_id),
        "placeholder": placeholder,
        "min_values": 1,
        "max_values": 1,
        "options": [signed_up_option(s, numbers.get(s.discord_user_id), signups) for s in shown],
    }


def swap_review_data(
    event: WowRaidEvent,
    target: Target,
    signup: WowRaidSignup,
    label: str,
    holder: WowRaidSignup,
    signups: Sequence[WowRaidSignup],
    *,
    reach: Reach,
    holder_reach: Reach,
) -> dict[str, Any]:
    """Seat the player (as *label*) and bench *holder*?  Then the holder's note, a limit gone over, who gets no DM."""
    uid = target.user_id
    benched = holder_target(holder)
    lines = [raid_manage_copy.swap_prompt(target.who, label, benched.who, spec_label(holder))]
    note = shown_note(event, holder)
    if note is not None:
        lines.append(raid_manage_copy.holder_note(benched.who, escape_note(note)))
    hit = swap_limit(event, signup, holder, signups)
    if hit is not None:
        lines.append(raid_manage_copy.over_limit_ok(hit))
    for who, its_reach in ((target.who, reach), (benched.who, holder_reach)):
        if its_reach == "off":
            lines.append(raid_manage_copy.dm_off(who))
    buttons = [*_swap_buttons(event, uid, holder.discord_user_id, reach, holder_reach), back_to_holders(event, uid)]
    return card_data(event, target, "\n".join(lines), [action_row(*buttons)])


def _swap_buttons(
    event: WowRaidEvent, user_id: str, holder_id: str, reach: Reach, holder_reach: Reach
) -> list[dict[str, Any]]:
    """[Swap and tell them] [Swap quietly] when a DM reaches either, [Swap and say why] the holder; else [Swap]."""
    if "yes" not in (reach, holder_reach):
        return [button(raid_manage_copy.SWAP, BUTTON_STYLE_PRIMARY, manage(event.id, "swapq", user_id, holder_id))]
    buttons = [
        button(raid_manage_copy.SWAP_TELL, BUTTON_STYLE_PRIMARY, manage(event.id, "swapt", user_id, holder_id)),
        button(raid_manage_copy.SWAP_QUIET, BUTTON_STYLE_SECONDARY, manage(event.id, "swapq", user_id, holder_id)),
    ]
    if holder_reach == "yes":
        why = manage(event.id, "swapr", user_id, holder_id)
        buttons.append(button(raid_manage_copy.SWAP_WHY, BUTTON_STYLE_SECONDARY, why))
    return buttons
