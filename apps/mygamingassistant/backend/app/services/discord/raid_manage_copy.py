"""What Manage sign-ups says: a raid's leader adding, changing and removing players.

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
PICK_CLASS: Final = "Pick their class"
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


# ---------------------------------------------------------------------------
# A player's card
# ---------------------------------------------------------------------------


def not_on_raid(who: str) -> str:
    return f"{who} isn't on this raid yet. Pick the class they're bringing."


def absent(who: str) -> str:
    return f"{who} marked themselves **absent**. Pick a class to add them back."


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


def added_queued(who: str, position: int | None) -> str:
    return (
        f"The raid is full, so {who} is **{queue_place(position)}**. "
        "Raise the size with `/raid-admin edit`, or free a seat, and I'll move them up."
    )


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
        text += " Their seat goes to the next player in the queue."
    return text


def removed(who: str, moved_up: Sequence[str]) -> str:
    """'Removed **Bob**. **Carol** moved up from the queue.'"""
    text = f"Removed {who}."
    if moved_up:
        text += f" {_joined(moved_up)} moved up from the queue."
    return text


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
) -> str:
    """The leader shows as a mention: tappable, and nobody is pinged in a DM.

    Once sign-ups close (or the raid starts) the post's Absence button no
    longer works, so a player who can't come is sent to the leader.
    """
    text = f"<@{leader_id}> added you to **{raid_label}** (<t:{unix}:F>, <t:{unix}:R>) as **{label}**. "
    if queue_position is None:
        text += "You have a seat. Can't make it? "
        if signups_open:
            text += "Tap **Absence** on the raid post."
        else:
            text += f"Let <@{leader_id}> know."
    else:
        place = queue_place(queue_position)
        text += f"The raid is full, so you're **{place}**. I'll move you up automatically when a seat opens."
    if link:
        text += f"\n[Jump to the raid]({link})"
    return text


def removed_dm(leader_id: str, raid_label: str, unix: int) -> str:
    return f"<@{leader_id}> removed you from **{raid_label}** (<t:{unix}:F>). Questions? Ask them directly."


def dm_failed(who: str) -> str:
    return f"I couldn't DM {who}. Their DMs may be closed, so you may want to tell them yourself."


def _joined(items: Sequence[str]) -> str:
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" and {items[-1]}"
