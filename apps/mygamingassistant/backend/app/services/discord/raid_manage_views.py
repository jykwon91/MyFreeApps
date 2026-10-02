"""Manage sign-ups — a raid's leader adds, changes, moves and removes players — pure builders.

[Manage sign-ups] on Raid: Signed and [Sign-ups] on Raid: Edit open the
hub: the raid, its seats, a member picker and a menu of who's signed up
(numbered as on the post, 25 to a page).  Picking someone in either opens
their card, which says where they stand and offers what fits:

* not on the raid (or marked absent) → their class, then their spec, then
  a review: [Add and tell them] / [Add quietly], or just [Add].  With a
  spec on file (the one they marked absence as, else their saved one) the
  card is that review already, with the class menu to pick another;
* on it → a class and spec to switch them to; [Seat] [Late] [Tentative]
  [Bench] to move them, which asks first when the move gives up or takes
  a seat or a place in the queue: [Move and tell them] / [Move quietly],
  or just [Move]; and [Remove], which asks first: [Remove and tell them] /
  [Remove quietly], or just [Remove].

Every "and tell them" has an "and say why" beside it (a reason for the DM).

A player's cards carry an embed whose author line is the player (name and
avatar).  A custom_id has no room for a name, so the next click reads it
back off the card it came from (:class:`Target`).  Every card names the
raid on top; a *notice* (what the last tap did) follows it.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final, Literal

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_STRING_SELECT,
    COMPONENT_TYPE_USER_SELECT,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_manage_copy, raid_member_copy, raid_member_views
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_copy import queue_place
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import action_row, button, class_select, spec_select
from app.services.wow.raid_catalog import WowSpecInfo, column_specs, effective_spec, signup_label, spec_info
from app.services.wow.raid_custom_id import MANAGE_MAX_PAGE, MARK_STATUSES, NO_ARG, manage
from app.services.wow.raid_embed import post_color
from app.services.wow.raid_limits import LimitCheck, LimitHit, Limits
from app.services.wow.raid_roster import (
    BENCH_STATUS,
    LINE_STATUSES,
    LISTED_STATUSES,
    QUEUED_STATUS,
    SEAT_STATUSES,
    TENTATIVE_STATUS,
    compute_roster_summary,
    in_line_order,
    order_numbers,
    queue_position,
)
from app.services.wow.raid_text import escape_name, seats_label

# Whether a DM can reach the player: yes; they're the leader themself; or they turned DMs off.
Reach = Literal["yes", "self", "off"]

# Discord's limits: a menu holds 25 options, and an option's label and description 100 characters each.
ROSTER_PAGE: Final = 25
_OPTION_CHARS: Final = 100
# What the sign-up menu says of a player's status; a seat says nothing and the queue gives the place.
_STATUS_WORDS: Final = {"late": "late", TENTATIVE_STATUS: "tentative", BENCH_STATUS: "bench"}
# The status row, a button per ``MARK_STATUSES``: its label and icon (a seat needs none).
_MARK_BUTTONS: Final[dict[str, tuple[str, str | None]]] = {
    "confirmed": (raid_manage_copy.SEAT, None),
    "late": (raid_manage_copy.LATE, "status_late"),
    TENTATIVE_STATUS: (raid_manage_copy.TENTATIVE, "status_tentative"),
    BENCH_STATUS: (raid_manage_copy.BENCH, "status_bench"),
}


@dataclass(frozen=True)
class Target:
    """The player a card is about: their Discord id, and their name and avatar when known."""

    user_id: str
    name: str | None = None
    avatar_url: str | None = None

    @property
    def who(self) -> str:
        """'**Bob**'; with no name, a mention (it shows their name and pings nobody)."""
        if self.name:
            return f"**{escape_name(self.name)}**"
        return f"<@{self.user_id}>"


@dataclass(frozen=True)
class Offer:
    """The spec a card offers to add a player as, and whether a DM reaches them."""

    spec: WowSpecInfo
    reach: Reach


def signup_of(signups: Sequence[WowRaidSignup], user_id: str) -> WowRaidSignup | None:
    """The player's sign-up row, whatever its status."""
    return next((s for s in signups if s.discord_user_id == user_id), None)


def listed_signup(signups: Sequence[WowRaidSignup], user_id: str) -> WowRaidSignup | None:
    """The player's sign-up while they're on the raid (anything but absence)."""
    mine = signup_of(signups, user_id)
    if mine is None or mine.status not in LISTED_STATUSES:
        return None
    return mine


def spec_label(signup: WowRaidSignup) -> str | None:
    """'Fury Warrior' ('Warrior (Tank)' from before specs); None with no class picked."""
    if signup.wow_class is None:
        return None
    return signup_label(signup.wow_class, signup.role, signup.spec)


def roster_description(signup: WowRaidSignup, signups: Sequence[WowRaidSignup]) -> str | None:
    """'Fury Warrior · late', 'Arms Warrior · #2 in the queue'; a seat is just its spec (None with neither)."""
    parts: list[str] = []
    label = spec_label(signup)
    if label:
        parts.append(label)
    if signup.status == QUEUED_STATUS:
        parts.append(queue_place(queue_position(signups, signup.discord_user_id)))
    elif signup.status in _STATUS_WORDS:
        parts.append(_STATUS_WORDS[signup.status])
    if not parts:
        return None
    return " · ".join(parts)[:_OPTION_CHARS]


# ---------------------------------------------------------------------------
# The hub
# ---------------------------------------------------------------------------


def hub_data(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], *, notice: str | None = None, page: int = 1
) -> dict[str, Any]:
    """The raid and its seats, a member picker, the sign-up menu at *page* (kept in range) and [Done]."""
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    lines = [raid_line(event)]
    if notice:
        lines.append(notice)
    lines += [f"**Seats:** {seats_label(summary)}", raid_manage_copy.HUB_PROMPT]
    picker = {
        "type": COMPONENT_TYPE_USER_SELECT,
        "custom_id": manage(event.id, "who"),
        "placeholder": raid_manage_copy.PICK_PLAYER,
        "min_values": 1,
        "max_values": 1,
    }
    rows = [action_row(picker)]
    buttons = [button("Done", BUTTON_STYLE_PRIMARY, manage(event.id, "done"))]
    listed = _listed_in_order(signups)
    if listed:
        pages = min(math.ceil(len(listed) / ROSTER_PAGE), MANAGE_MAX_PAGE)
        page = min(max(page, 1), pages)
        rows.append(action_row(_signed_up_select(event, listed, signups, page)))
        if pages > 1:
            buttons = [*pager(event, page, pages), *buttons]
    rows.append(action_row(*buttons))
    return ephemeral_data("\n".join(lines), components=rows, embeds=[])


def _listed_in_order(signups: Sequence[WowRaidSignup]) -> list[WowRaidSignup]:
    """Everyone on the raid as the post lists them: the numbered line (seats and queue), tentative, bench."""
    line = in_line_order(s for s in signups if s.status in LINE_STATUSES)
    tentative = in_line_order(s for s in signups if s.status == TENTATIVE_STATUS)
    bench = in_line_order(s for s in signups if s.status == BENCH_STATUS)
    return [*line, *tentative, *bench]


def _signed_up_select(
    event: WowRaidEvent, listed: Sequence[WowRaidSignup], signups: Sequence[WowRaidSignup], page: int
) -> dict[str, Any]:
    """*page* of the sign-up menu; its placeholder says which part of a longer list it shows."""
    first = (page - 1) * ROSTER_PAGE
    shown = listed[first : first + ROSTER_PAGE]
    placeholder = raid_manage_copy.PICK_SIGNED_UP
    if len(listed) > ROSTER_PAGE:
        placeholder = raid_manage_copy.signed_up_page(first + 1, first + len(shown), len(listed))
    numbers = order_numbers(signups)
    return {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": manage(event.id, "row"),
        "placeholder": placeholder,
        "min_values": 1,
        "max_values": 1,
        "options": [signed_up_option(s, numbers.get(s.discord_user_id), signups) for s in shown],
    }


def signed_up_option(signup: WowRaidSignup, number: int | None, signups: Sequence[WowRaidSignup]) -> dict[str, Any]:
    """'12. Bob' over where they stand.  An option shows no markdown, so the name goes in as it is."""
    label = signup.display_name
    if number is not None:
        label = f"{number}. {label}"
    option = {"label": label[:_OPTION_CHARS], "value": signup.discord_user_id}
    description = roster_description(signup, signups)
    if description:
        option["description"] = description
    return option


def pager(event: WowRaidEvent, page: int, pages: int, verb: str = "list", member: str = NO_ARG) -> list[dict[str, Any]]:
    """[Previous] [Next]; at either end that one is greyed out (pointing at its own page, so no two ids clash)."""
    back = manage(event.id, verb, member, str(max(page - 1, 1)))
    ahead = manage(event.id, verb, member, str(min(page + 1, pages)))
    return [
        button(raid_manage_copy.PREV_PAGE, BUTTON_STYLE_SECONDARY, back, disabled=page == 1),
        button(raid_manage_copy.NEXT_PAGE, BUTTON_STYLE_SECONDARY, ahead, disabled=page == pages),
    ]


# ---------------------------------------------------------------------------
# A player's cards
# ---------------------------------------------------------------------------


def player_data(
    event: WowRaidEvent,
    target: Target,
    signups: Sequence[WowRaidSignup],
    *,
    emojis: EmojiSet,
    notice: str | None = None,
    offer: Offer | None = None,
) -> dict[str, Any]:
    """Where the player stands and a class select; on the raid, the status row and [Remove] too.

    Off the raid with a spec on file (*offer*), the card is the add review.
    """
    uid = target.user_id
    back = button("Back", BUTTON_STYLE_SECONDARY, manage(event.id, "open"))
    mine = signup_of(signups, uid)
    if mine is None or mine.status not in LISTED_STATUSES:
        if offer is not None:
            lines = _add_lines(event, target, offer.spec, signups, reach=offer.reach)
            if mine is not None:
                lines[:0] = [raid_manage_copy.absent_note(target.who), *raid_member_views.note_lines(event, mine)]
            select = class_select(manage(event.id, "class", uid), raid_manage_copy.PICK_OTHER_CLASS, emojis=emojis)
            buttons = [*_add_buttons(event, uid, offer.spec, offer.reach), back]
            return card_data(event, target, "\n".join(lines), [action_row(select), action_row(*buttons)], notice=notice)
        text = raid_manage_copy.not_on_raid(target.who)
        if mine is not None:
            text = "\n".join([raid_manage_copy.absent(target.who), *raid_member_views.note_lines(event, mine)])
        select = class_select(manage(event.id, "class", uid), raid_manage_copy.PICK_CLASS, emojis=emojis)
        return card_data(event, target, text, [action_row(select), action_row(back)], notice=notice)
    lines = [raid_manage_copy.on_raid(target.who, mine.status, spec_label(mine), queue_position(signups, uid))]
    if mine.character_name is not None:
        lines.append(raid_member_copy.character_line(escape_name(mine.character_name)))
    lines.extend(raid_member_views.note_lines(event, mine))
    select = class_select(manage(event.id, "class", uid), raid_manage_copy.CHANGE_CLASS, emojis=emojis)
    rows = [action_row(select)]
    if mine.wow_class is not None:
        # Without a class (a tentative sign-up may have none) there's nothing to seat them as.
        rows.append(status_row(event, mine, signups, emojis=emojis))
        if needs_swap(event, mine, signups):
            lines.append(raid_manage_copy.SEAT_SWAPS)
    rows.append(action_row(button(raid_manage_copy.REMOVE, BUTTON_STYLE_DANGER, manage(event.id, "ask", uid)), back))
    return card_data(event, target, "\n".join(lines), rows, notice=notice)


def status_row(
    event: WowRaidEvent, signup: WowRaidSignup, signups: Sequence[WowRaidSignup], *, emojis: EmojiSet
) -> dict[str, Any]:
    """[Seat] [Late] [Tentative] [Bench]: where they are now in blue; that, and what can't be had, greyed out."""
    greyed = _greyed_marks(event, signup, signups)
    buttons: list[dict[str, Any]] = []
    for status in MARK_STATUSES:
        label, icon = _MARK_BUTTONS[status]
        emoji = None
        if icon is not None:
            emoji = emojis.component(icon)
        style = BUTTON_STYLE_SECONDARY
        if status == signup.status:
            style = BUTTON_STYLE_PRIMARY
        custom_id = manage(event.id, "mark", signup.discord_user_id, status)
        disabled = status == signup.status or status in greyed
        buttons.append(button(label, style, custom_id, emoji=emoji, disabled=disabled))
    return action_row(*buttons)


def _greyed_marks(event: WowRaidEvent, signup: WowRaidSignup, signups: Sequence[WowRaidSignup]) -> tuple[str, ...]:
    """What the row can't move them to: on a full raid, late needs a seat first ([Seat] asks who gives one up)."""
    if needs_swap(event, signup, signups):
        return ("late",)
    return ()


def needs_swap(event: WowRaidEvent, signup: WowRaidSignup, signups: Sequence[WowRaidSignup]) -> bool:
    """A seat for them now is a seat holder's: they hold none (tentative, bench or queued), and the raid is full."""
    return signup.status not in SEAT_STATUSES and compute_roster_summary(signups, size_cap=event.size_cap).is_full


def spec_data(
    event: WowRaidEvent,
    target: Target,
    column: str,
    signups: Sequence[WowRaidSignup],
    *,
    emojis: EmojiSet,
) -> dict[str, Any]:
    """*column*'s specs; those over a limit are marked, and still picked (leaders may go over)."""
    uid = target.user_id
    mine = listed_signup(signups, uid)
    status = "confirmed"
    current = None
    if mine is not None:
        status = mine.status
        spec = spec_info(mine.wow_class, mine.spec)
        # Preselected only on the raid: picking it again then changes nothing (Discord sends nothing).
        if spec is not None and spec in column_specs(column):
            current = spec
    blocks = LimitCheck(Limits.of(event), signups, uid, status).blocks(column)
    select = spec_select(
        manage(event.id, "spec", uid, column),
        raid_manage_copy.PICK_SPEC,
        column,
        current=current,
        emojis=emojis,
        blocks=blocks,
    )
    text = raid_manage_copy.spec_prompt(target.who, column)
    if blocks:
        text = f"{text}\n{raid_manage_copy.SPEC_MARKS_NOTE}"
    rows = [action_row(select), action_row(back_to_player(event, uid))]
    return card_data(event, target, text, rows)


def review_data(
    event: WowRaidEvent,
    target: Target,
    spec: WowSpecInfo,
    signups: Sequence[WowRaidSignup],
    *,
    reach: Reach,
) -> dict[str, Any]:
    """Add the player as *spec*?  Says first if they'd be queued or go over a limit."""
    uid = target.user_id
    lines = _add_lines(event, target, spec, signups, reach=reach)
    buttons = [*_add_buttons(event, uid, spec, reach), back_to_player(event, uid)]
    return card_data(event, target, "\n".join(lines), [action_row(*buttons)])


def _add_lines(
    event: WowRaidEvent, target: Target, spec: WowSpecInfo, signups: Sequence[WowRaidSignup], *, reach: Reach
) -> list[str]:
    """'Add **Bob** to this raid as **Fury Warrior**?', then if they'd be queued, go over a limit or get no DM."""
    lines = [raid_manage_copy.review(target.who, spec.full_label)]
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    if summary.is_full:
        lines.append(raid_manage_copy.would_queue(summary.queued_count + 1))
    hit = LimitCheck(Limits.of(event), signups, target.user_id, "confirmed").hit(spec)
    if hit is not None:
        lines.append(raid_manage_copy.over_limit_ok(hit))
    if reach == "off":
        lines.append(raid_manage_copy.dm_off(target.who))
    return lines


def _add_buttons(event: WowRaidEvent, user_id: str, spec: WowSpecInfo, reach: Reach) -> list[dict[str, Any]]:
    """[Add and tell them] [Add quietly] [Add and say why] when a DM can reach them; else just [Add]."""
    choice = spec.choice_value
    if reach == "yes":
        return [
            button(raid_manage_copy.ADD_TELL, BUTTON_STYLE_PRIMARY, manage(event.id, "addt", user_id, choice)),
            button(raid_manage_copy.ADD_QUIET, BUTTON_STYLE_SECONDARY, manage(event.id, "addq", user_id, choice)),
            button(raid_manage_copy.ADD_WHY, BUTTON_STYLE_SECONDARY, manage(event.id, "addr", user_id, choice)),
        ]
    return [button(raid_manage_copy.ADD, BUTTON_STYLE_PRIMARY, manage(event.id, "addq", user_id, choice))]


def remove_data(
    event: WowRaidEvent,
    target: Target,
    signup: WowRaidSignup,
    signups: Sequence[WowRaidSignup],
    *,
    reach: Reach,
) -> dict[str, Any]:
    """Remove the player?  Says so when their seat goes to the queue."""
    uid = target.user_id
    frees_seat = signup.status in SEAT_STATUSES and any(s.status == QUEUED_STATUS for s in signups)
    text = raid_manage_copy.remove_prompt(target.who, spec_label(signup), frees_seat=frees_seat)
    if reach == "yes":
        buttons = [
            button(raid_manage_copy.REMOVE_TELL, BUTTON_STYLE_DANGER, manage(event.id, "dropt", uid)),
            button(raid_manage_copy.REMOVE_QUIET, BUTTON_STYLE_SECONDARY, manage(event.id, "dropq", uid)),
            button(raid_manage_copy.REMOVE_WHY, BUTTON_STYLE_SECONDARY, manage(event.id, "dropr", uid)),
        ]
    else:
        if reach == "off":
            text = f"{text}\n{raid_manage_copy.dm_off(target.who)}"
        buttons = [button(raid_manage_copy.REMOVE, BUTTON_STYLE_DANGER, manage(event.id, "dropq", uid))]
    buttons.append(button(raid_manage_copy.KEEP, BUTTON_STYLE_SECONDARY, manage(event.id, "card", uid)))
    return card_data(event, target, text, [action_row(*buttons)])


def mark_review_data(
    event: WowRaidEvent,
    target: Target,
    signup: WowRaidSignup,
    status: str,
    label: str,
    signups: Sequence[WowRaidSignup],
    *,
    reach: Reach,
    back: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Move the player (as *label*) to *status*?  Says what it does to the queue, and if it goes over a limit.

    ``queued`` is [Queue them instead]'s review: a seat asked for, so a place in the queue (*back*: its [Back]).
    """
    uid = target.user_id
    lines = [raid_manage_copy.move_prompt(target.who, label, status), *_move_effects(event, signup, status, signups)]
    hit = over_limit(event, signup, status, signups)
    if hit is not None:
        lines.append(raid_manage_copy.over_limit_ok(hit))
    if reach == "yes":
        buttons = [
            button(raid_manage_copy.MOVE_TELL, BUTTON_STYLE_PRIMARY, manage(event.id, "markt", uid, status)),
            button(raid_manage_copy.MOVE_QUIET, BUTTON_STYLE_SECONDARY, manage(event.id, "markq", uid, status)),
            button(raid_manage_copy.MOVE_WHY, BUTTON_STYLE_SECONDARY, manage(event.id, "markr", uid, status)),
        ]
    else:
        if reach == "off":
            lines.append(raid_manage_copy.dm_off(target.who))
        buttons = [button(raid_manage_copy.MOVE, BUTTON_STYLE_PRIMARY, manage(event.id, "markq", uid, status))]
    buttons.append(back or back_to_player(event, uid))
    return card_data(event, target, "\n".join(lines), [action_row(*buttons)])


def over_limit(
    event: WowRaidEvent, signup: WowRaidSignup, status: str, signups: Sequence[WowRaidSignup]
) -> LimitHit | None:
    """The limit a move to *status* goes over.  Only a move onto the line can: one off it, or along it, never does."""
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is None:
        return None
    return LimitCheck(Limits.of(event), signups, signup.discord_user_id, status).hit(spec)


def _move_effects(
    event: WowRaidEvent, signup: WowRaidSignup, status: str, signups: Sequence[WowRaidSignup]
) -> list[str]:
    """What a move does to the line: [Queue them instead] is a place in the queue; a seat given up goes to it."""
    queued = compute_roster_summary(signups, size_cap=event.size_cap).queued_count
    if status == QUEUED_STATUS:
        return [raid_manage_copy.would_queue(queued + 1)]
    if status in SEAT_STATUSES:
        return []
    if signup.status in SEAT_STATUSES and queued:
        return [raid_manage_copy.SEAT_GOES_ON]
    if signup.status == QUEUED_STATUS:
        return [raid_manage_copy.QUEUE_PLACE_LOST]
    return []


def back_to_player(event: WowRaidEvent, user_id: str) -> dict[str, Any]:
    return button("Back", BUTTON_STYLE_SECONDARY, manage(event.id, "card", user_id))


def card_data(
    event: WowRaidEvent,
    target: Target,
    text: str,
    rows: list[dict[str, Any]],
    *,
    notice: str | None = None,
) -> dict[str, Any]:
    """The raid on top, then *notice*; *text* goes in an embed headed by the player."""
    content = raid_line(event)
    if notice:
        content = f"{content}\n{notice}"
    return ephemeral_data(content, components=rows, embeds=[player_embed(target, text, color=post_color(event))])


def player_embed(target: Target, text: str, *, color: int | None = None) -> dict[str, Any]:
    """*text* in an embed headed by the player's name and avatar."""
    embed: dict[str, Any] = {"description": text}
    if color is not None:
        embed["color"] = color
    if target.name:
        # The author line is plain text (no markdown), so the name goes in as it is.
        author = {"name": target.name}
        if target.avatar_url:
            author["icon_url"] = target.avatar_url
        embed["author"] = author
    return embed
