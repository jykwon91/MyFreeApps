"""Copy for Raid: Unsigned — who hasn't signed up, and pinging them — and /raid-admin raiders.

Roles go in as ids and come out as role mentions; the cards never ping
(their allowed mentions are none).  Names come in already escaped.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.services.discord import raid_copy
from app.services.discord.raid_draft_copy import role_list
from app.services.wow.raid_unsigned import MAX_PAGES, MAX_PING, PAGE_SIZE, PingBlock, PoolSource

SIGNED_BUTTON: Final = "Not signed up"
PING_BUTTON: Final = "Ping them"
REFRESH: Final = "Refresh"
BACK: Final = "Back"
CHECKING: Final = "Checking who hasn't signed up…"
CHECKING_PING: Final = "Checking who to ping…"
CHECKING_ROLES: Final = "Checking the server's roles…"
NO_POOL: Final = "Pick the roles your raiders have, and I'll list who hasn't signed up."
NO_POOL_ADMIN: Final = f"Set a default for every raid with `/{raid_copy.ADMIN_COMMAND} raiders`."
ALL_SIGNED: Final = "Everyone with these roles has signed up."
ROLE_PLACEHOLDER: Final = "Who should sign up for this raid?"
ROLES_RESET: Final = "Back to the default roles."
EVERYONE_REFUSED: Final = "Pick the roles your raiders have, not @everyone."
ROLES_GONE: Final = "A role this raid checked no longer exists, so it's left out."
INTENT_OFF: Final = (
    "I can't read this server's member list yet. The bot's owner has to turn on **Server Members Intent**: "
    "Discord Developer Portal → the app → **Bot** → Privileged Gateway Intents."
)
NO_ANSWER: Final = "Discord didn't answer in time. Try **Refresh** in a minute."
MODAL_TITLE: Final = "Ping who hasn't signed up"
FIELD_LABEL: Final = "Message"
FIELD_HINT: Final = "Sent in the raid's channel as a reply to its post, mentioning everyone not signed up."
NOBODY_TO_PING: Final = "Everyone with these roles has signed up, so there's nobody to ping."
RAIDERS_PROMPT: Final = (
    "**Raider roles**: who Unsigned checks on every raid, unless a raid picks its own roles. "
    "With none set, it checks the roles each raid pings."
)
RAIDERS_PLACEHOLDER: Final = "Which roles do your raiders have?"
RAIDERS_CLEARED: Final = "Cleared. Unsigned checks the roles each raid pings."
RAIDERS_NO_ANSWER: Final = f"Discord didn't answer in time. Run `/{raid_copy.ADMIN_COMMAND} raiders` again in a minute."

_SOURCES: Final[dict[str, str]] = {
    "raid": "picked for this raid",
    "server": "the server's raider roles",
    "pings": "the roles this raid pings",
}
# Why [Ping them] can't go out: the first three under the list, the rest above it.
_BLOCKS: Final[dict[str, str]] = {
    "started": raid_copy.RAID_STARTED,
    "closed": "Sign-ups are closed, so there's no one to call in.",
    "too_many": f"That's more than {MAX_PING} people. Pick narrower roles to ping them.",
    "cancelled": raid_copy.ALREADY_CANCELLED,
    "nobody": NOBODY_TO_PING,
}
_CARD_BLOCKS: Final = ("started", "closed", "too_many")


def title(count: int) -> str:
    return f"Not signed up ({count})"


def pool_line(role_ids: Sequence[str], source: PoolSource) -> str:
    """'Checking <@&a> and <@&b> · picked for this raid'."""
    return f"Checking {role_list(role_ids)} · {_SOURCES[source]}"


def block_line(block: PingBlock | None) -> str | None:
    """The line under the list saying why [Ping them] is off; None when the list says it already."""
    if block in _CARD_BLOCKS:
        return _BLOCKS[block]
    return None


def ping_refused(block: PingBlock) -> str | None:
    """Why the ping didn't go out, above the list; None when the line under it says so."""
    if block in _CARD_BLOCKS:
        return None
    return _BLOCKS[block]


def roles_saved(role_ids: Sequence[str]) -> str:
    return f"Saved. This raid checks {role_list(role_ids)}."


def raiders_saved(role_ids: Sequence[str]) -> str:
    return f"Saved. Unsigned checks {role_list(role_ids)} by default."


def footer(raid_id: str, expected_count: int, *, truncated: bool) -> str:
    """'Raid ID abc123 · 12 members with these roles', and when the list was cut short, where."""
    parts = [f"Raid ID {raid_id}", f"{_members(expected_count)} with these roles"]
    if truncated:
        parts.append(f"checked the first {PAGE_SIZE * MAX_PAGES:,} server members")
    return " · ".join(parts)


def fetch_failed(code: int | None, status: int) -> str:
    """Discord refused the member list for another reason than the intent."""
    return f"Discord didn't give me the member list (error {code or status}). Try **Refresh** in a minute."


def ping_prefill(raid_title: str) -> str:
    return (
        f"Haven't signed up for **{raid_title}** yet? Tap your class on the raid post, "
        "or **Absence** if you can't make it."
    )


def _members(count: int) -> str:
    if count == 1:
        return "1 member"
    return f"{count:,} members"
