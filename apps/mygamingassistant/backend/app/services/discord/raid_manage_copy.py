"""What Manage sign-ups says: a raid's leader adding, changing, moving and removing players.

*who* is the player as a card names them: '**Bob**' (escaped), or a
mention when the card no longer carries their name.  Labels arrive as
'Fury Warrior' (``WowSpecInfo.full_label``).
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.services.discord.raid_copy import queue_place
from app.services.discord.raid_limit_copy import hit_text
from app.services.wow.raid_catalog import CLASSES_BY_KEY, TANK_COLUMN
from app.services.wow.raid_limits import LimitHit
from app.services.wow.raid_roster import BENCH_STATUS, QUEUED_STATUS, TENTATIVE_STATUS

# Where the hub opens from: Raid: Signed and Raid: Edit.
SIGNED_BUTTON: Final = "Manage sign-ups"
EDIT_BUTTON: Final = "Sign-ups"

HUB_PROMPT: Final = "Pick a player to add, change or remove."
PICK_PLAYER: Final = "Pick a player"
PICK_SIGNED_UP: Final = "Or pick someone signed up"
PREV_PAGE: Final = "Previous"
NEXT_PAGE: Final = "Next"
PICK_CLASS: Final = "Pick their class"
# The class menu under a spec the bot offers (their saved one, or the one they marked absence as).
PICK_OTHER_CLASS: Final = "Or pick a different class"
CHANGE_CLASS: Final = "Change class or spec"
PICK_SPEC: Final = "Pick their spec"
SPEC_MARKS_NOTE: Final = "Marked specs are over a limit. You can still pick them."
DONE: Final = "Done."
GONE: Final = "This raid is cancelled or finished, so its sign-ups can't be changed."
DM_SENDING: Final = "I'm sending them a DM."

ADD_TELL: Final = "Add and tell them"
ADD_QUIET: Final = "Add quietly"
ADD: Final = "Add"
REMOVE: Final = "Remove"
REMOVE_TELL: Final = "Remove and tell them"
REMOVE_QUIET: Final = "Remove quietly"
KEEP: Final = "Keep them"
SEAT: Final = "Seat"
LATE: Final = "Late"
TENTATIVE: Final = "Tentative"
BENCH: Final = "Bench"
MOVE_TELL: Final = "Move and tell them"
MOVE_QUIET: Final = "Move quietly"
MOVE: Final = "Move"
ADD_WHY: Final = "Add and say why"
REMOVE_WHY: Final = "Remove and say why"
MOVE_WHY: Final = "Move and say why"

# The form a "say why" button opens: what the leader types goes in the player's DM.
REASON_TITLE: Final = "Tell them why"
REASON_LABEL: Final = "Reason"
REASON_HINT: Final = "I'll add this to the DM."

# What a seat given up, or a place in the queue left, does to the queue.
SEAT_GOES_ON: Final = "Their seat goes to the next player in the queue."
QUEUE_PLACE_LOST: Final = "They lose their place in the queue."
# A queued player's card, and an add that queued them.
QUEUE_WAITS: Final = "Raise the size with `/raid-admin edit`, or free a seat, and I'll move them up."
# A tentative or benched player's card on a full raid, where [Late] is greyed out.
SEAT_QUEUES: Final = "The raid is full, so **Seat** puts them in the queue."


def signed_up_page(first: int, last: int, total: int) -> str:
    """The sign-up menu on one page of several: 'Or pick someone signed up (26 to 50 of 61)'."""
    return f"{PICK_SIGNED_UP} ({first} to {last} of {total})"


# ---------------------------------------------------------------------------
# Raid: Manage (right-click a member) — which raid, when they lead several
# ---------------------------------------------------------------------------

PICK_RAID: Final = "Pick a raid"
# Under a raid in the menu: where the player stands on it (else their spec and status).
NOT_SIGNED_UP: Final = "Not signed up"
MARKED_ABSENT: Final = "Marked absent"


def raid_pick_prompt(who: str) -> str:
    return f"Pick the raid to manage {who} on."


# ---------------------------------------------------------------------------
# A player's card
# ---------------------------------------------------------------------------


def not_on_raid(who: str) -> str:
    return f"{who} isn't on this raid yet. Pick the class they're bringing."


def absent_note(who: str) -> str:
    return f"{who} marked themselves **absent**."


def absent(who: str) -> str:
    return f"{absent_note(who)} Pick a class to add them back."


def on_raid(who: str, status: str, label: str | None, queue_position: int | None) -> str:
    """'**Bob** is in as **Fury Warrior**.' and the like, by status."""
    spec = ""
    if label:
        spec = f" as **{label}**"
    if status == "late":
        return f"{who} is in{spec} and marked **late**."
    if status == QUEUED_STATUS:
        return f"{who} is **{queue_place(queue_position)}**{spec}."
    if status == BENCH_STATUS:
        return f"{who} is on the **bench**{spec}."
    if status == TENTATIVE_STATUS:
        return f"{who} is **tentative**{spec}."
    return f"{who} is in{spec}."


def spec_prompt(who: str, column: str) -> str:
    if column == TANK_COLUMN:
        return f"Which tank is {who} bringing?"
    return f"Which **{CLASSES_BY_KEY[column].label}** spec is {who} bringing?"


def gone_from_raid(who: str) -> str:
    return f"{who} isn't on this raid any more."


def already_on(who: str) -> str:
    """An add tapped after the player got on the raid some other way."""
    return f"{who} is already on this raid."


# ---------------------------------------------------------------------------
# Adding
# ---------------------------------------------------------------------------


def review(who: str, label: str) -> str:
    return f"Add {who} to this raid as **{label}**?"


def would_queue(position: int) -> str:
    return f"The raid is full, so they'd be **{queue_place(position)}**."


def over_limit_ok(hit: LimitHit) -> str:
    return f"{hit_text(hit)} Leaders can go over limits, so this still works."


def dm_off(who: str) -> str:
    return f"{who} has DM reminders off, so I can't message them."


def added(who: str, label: str) -> str:
    return f"{who} is in as **{label}**."


def queued_full(who: str, position: int | None) -> str:
    return f"The raid is full, so {who} is **{queue_place(position)}**."


def added_queued(who: str, position: int | None) -> str:
    return f"{queued_full(who, position)} {QUEUE_WAITS}"


def added_over(hit: LimitHit) -> str:
    return f"{hit_text(hit)} Leaders can go over limits, so I added them anyway."


def dm_off_done(who: str) -> str:
    return f"{who} has DM reminders off, so I didn't message them."


# ---------------------------------------------------------------------------
# Changing class or spec
# ---------------------------------------------------------------------------


def switched(who: str, label: str) -> str:
    return f"Switched {who} to **{label}**."


def unchanged(who: str, label: str) -> str:
    return f"Nothing changed. {who} is already **{label}**."


def switched_over(hit: LimitHit) -> str:
    return f"{hit_text(hit)} Leaders can go over limits, so I switched them anyway."


# ---------------------------------------------------------------------------
# Removing
# ---------------------------------------------------------------------------


def remove_prompt(who: str, label: str | None, *, frees_seat: bool) -> str:
    """'Remove **Bob** (Fury Warrior) from this raid?'; their seat going to the queue says so."""
    text = f"Remove {who} from this raid?"
    if label:
        text = f"Remove {who} (**{label}**) from this raid?"
    if frees_seat:
        text += f" {SEAT_GOES_ON}"
    return text


def removed(who: str, promoted: Sequence[str]) -> str:
    """'Removed **Bob**. **Carol** moved up from the queue.'"""
    text = f"Removed {who}."
    if promoted:
        text += f" {moved_up(promoted)}"
    return text


def moved_up(names: Sequence[str]) -> str:
    """'**Carol** moved up from the queue.'"""
    return f"{_joined(names)} moved up from the queue."


# ---------------------------------------------------------------------------
# Moving: a seat, late, tentative or the bench
# ---------------------------------------------------------------------------


def move_prompt(who: str, label: str, status: str) -> str:
    """'Give **Bob** a seat as **Fury Warrior**?' and the like, by the status asked for."""
    if status == "late":
        return f"Give {who} a seat as **{label}** and mark them **late**?"
    if status == TENTATIVE_STATUS:
        return f"Mark {who} (**{label}**) as **tentative**?"
    if status == BENCH_STATUS:
        return f"Move {who} (**{label}**) to the **bench**?"
    return f"Give {who} a seat as **{label}**?"


def moved(who: str, status: str, queue_position: int | None) -> str:
    """Where a move left the player: '**Bob** has a seat.'; a seat asked for on a full raid queued them."""
    if status == QUEUED_STATUS:
        return queued_full(who, queue_position)
    if status == "late":
        return f"{who} has a seat and is marked **late**."
    if status == TENTATIVE_STATUS:
        return f"{who} is **tentative**."
    if status == BENCH_STATUS:
        return f"{who} is on the **bench**."
    return f"{who} has a seat."


def status_unchanged(who: str, status: str, queue_position: int | None) -> str:
    return f"Nothing changed. {moved(who, status, queue_position)}"


def moved_over(hit: LimitHit) -> str:
    return f"{hit_text(hit)} Leaders can go over limits, so I moved them anyway."


# ---------------------------------------------------------------------------
# DMs to the player, and when they don't go out
# ---------------------------------------------------------------------------


def added_dm(
    leader_id: str,
    raid_label: str,
    unix: int,
    label: str,
    queue_position: int | None,
    link: str | None,
    *,
    signups_open: bool,
    reason: str | None = None,
) -> str:
    """The leader shows as a mention: tappable, and nobody is pinged in a DM."""
    text = f"<@{leader_id}> added you to **{raid_label}** (<t:{unix}:F>, <t:{unix}:R>) as **{label}**. "
    if queue_position is None:
        text += f"You have a seat. {_cant_make_it(leader_id, signups_open=signups_open)}"
    else:
        text += _queued_for_you(queue_position)
    return text + _reason(reason) + _jump(link)


def moved_dm(
    leader_id: str,
    raid_label: str,
    unix: int,
    label: str,
    status: str,
    queue_position: int | None,
    link: str | None,
    *,
    signups_open: bool,
    reason: str | None = None,
) -> str:
    """A seat or the queue says what happens next; tentative and the bench send questions to the leader."""
    leader = f"<@{leader_id}>"
    if status == TENTATIVE_STATUS:
        text = f"{leader} marked you **tentative** for **{raid_label}** (<t:{unix}:F>). Questions? Ask them directly."
    elif status == BENCH_STATUS:
        text = f"{leader} moved you to the **bench** for **{raid_label}** (<t:{unix}:F>). Questions? Ask them directly."
    elif status == QUEUED_STATUS:
        text = f"{leader} put you in the queue for **{raid_label}** (<t:{unix}:F>, <t:{unix}:R>) as **{label}**. "
        text += _queued_for_you(queue_position)
    else:
        text = f"{leader} gave you a seat on **{raid_label}** (<t:{unix}:F>, <t:{unix}:R>) as **{label}**"
        if status == "late":
            text += " and marked you **late**"
        text += f". {_cant_make_it(leader_id, signups_open=signups_open)}"
    return text + _reason(reason) + _jump(link)


def _cant_make_it(leader_id: str, *, signups_open: bool) -> str:
    """Once sign-ups close (or the raid starts) the post's Absence button no longer works: ask the leader."""
    if signups_open:
        return "Can't make it? Tap **Absence** on the raid post."
    return f"Can't make it? Let <@{leader_id}> know."


def _queued_for_you(queue_position: int | None) -> str:
    place = queue_place(queue_position)
    return f"The raid is full, so you're **{place}**. I'll move you up automatically when a seat opens."


def _jump(link: str | None) -> str:
    if link:
        return f"\n[Jump to the raid]({link})"
    return ""


def _reason(reason: str | None) -> str:
    """The leader's "say why", on a line of its own (as a cancelled raid's reason is)."""
    if reason:
        return f"\nReason: {reason}"
    return ""


def removed_dm(leader_id: str, raid_label: str, unix: int, *, reason: str | None = None) -> str:
    text = f"<@{leader_id}> removed you from **{raid_label}** (<t:{unix}:F>). Questions? Ask them directly."
    return text + _reason(reason)


def dm_failed(who: str) -> str:
    return f"I couldn't DM {who}. Their DMs may be closed, so you may want to tell them yourself."


def _joined(items: Sequence[str]) -> str:
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" and {items[-1]}"
