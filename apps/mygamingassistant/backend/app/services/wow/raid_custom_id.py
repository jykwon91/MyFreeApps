"""Encode / parse the raid bot's component ``custom_id`` strings.

Scheme: ``raid:v1:<action>[:<event_uuid>][:<arg>...]`` — always ≤ 100
characters (Discord's limit).  Parsing is defensive: any malformed or
unknown id yields ``None`` and the caller answers with the generic error.

Actions
-------
cls      public class buttons ([Tank] + one per class)  raid:v1:cls:<event>:<column>
status   public [Late]/[Tentative]/[Bench]/[Absence]  raid:v1:status:<event>:<status>
         (posts from before revision 0029 carry ``declined`` — read as ``absence``)
mine     public [My sign-up]                          raid:v1:mine:<event>
class    class select (value = tank or a class)       raid:v1:class:<event>:<status>
spec     spec select (value = <class>.<spec>)         raid:v1:spec:<event>:<column>:<status>
         (column ``tank`` lists every tank spec)
pickclass [Different class] under the spec select     raid:v1:pickclass:<event>:<status>
         (menus opened from My sign-up carry ``same``: keep the status you have when you pick)
change   [Change spec] on My sign-up                  raid:v1:change:<event>
card     [Full roster] / [Back] on My sign-up         raid:v1:card:<event>:<roster|back>
signup   [Sign up] on posts from before the class buttons   raid:v1:signup:<event>
roster   [Roster] on posts from before the class buttons    raid:v1:roster:<event>
role     role button from a pre-spec picker (legacy)  raid:v1:role:<event>:<status>:<class>:<role>
release  [Yes, free my seat] on the seat confirm      raid:v1:release:<event>:<status>
stay     [Keep my seat] on the seat confirm           raid:v1:stay:<event>
confirm  create preview [Post raid]                   raid:v1:confirm:<event>
discard  create preview [Cancel]                      raid:v1:discard:<event>
cancel   cancel flow [Cancel raid]                    raid:v1:cancel:<event>
keep     cancel flow [Keep raid]                      raid:v1:keep:<event>
testdm   /raid prefs [Send me a test DM]              raid:v1:testdm
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Final

from app.models.wow.wow_raid_signup import RAID_ROLES, WOW_CLASSES
from app.services.wow.raid_catalog import POST_COLUMNS
from app.services.wow.raid_roster import REQUESTABLE_STATUSES

PREFIX: Final = "raid:v1:"
MAX_CUSTOM_ID_LEN: Final = 100

# action → number of trailing args after the event id
_EVENT_ACTIONS: Final[dict[str, int]] = {
    "cls": 1,
    "card": 1,
    "signup": 0,
    "status": 1,
    "class": 1,
    "spec": 2,
    "pickclass": 1,
    "role": 3,
    "mine": 0,
    "change": 0,
    "roster": 0,
    "release": 1,
    "stay": 0,
    "confirm": 0,
    "discard": 0,
    "cancel": 0,
    "keep": 0,
}
_BARE_ACTIONS: Final = frozenset({"testdm"})

# A menu opened from My sign-up: keep whatever status you have when you pick.
SAME_STATUS: Final = "same"
# What the class / spec menus can carry: the status asked for, or ``same``.
_MENU_STATUSES: Final = (*REQUESTABLE_STATUSES, SAME_STATUS)
# What a seat holder can give their seat up for (the confirm card's [Yes]).
RELEASE_STATUSES: Final = ("tentative", "bench", "absence")
# The My sign-up card's views: the full roster, and back to the card.
CARD_VIEWS: Final = ("roster", "back")
# Old status names still on buttons of posts not re-rendered since they changed.
_LEGACY_STATUSES: Final[dict[str, str]] = {"declined": "absence"}


@dataclass(frozen=True)
class RaidCustomId:
    action: str
    event_id: uuid.UUID | None
    args: tuple[str, ...] = ()


def encode(action: str, event_id: uuid.UUID | None = None, *args: str) -> str:
    parts = [action]
    if event_id is not None:
        parts.append(str(event_id))
    parts.extend(args)
    custom_id = PREFIX + ":".join(parts)
    if len(custom_id) > MAX_CUSTOM_ID_LEN:
        raise ValueError(f"custom_id too long ({len(custom_id)}): {custom_id!r}")
    return custom_id


def parse(custom_id: object) -> RaidCustomId | None:
    """Parse and validate a custom_id; ``None`` for anything unexpected."""
    if not isinstance(custom_id, str) or len(custom_id) > MAX_CUSTOM_ID_LEN:
        return None
    if not custom_id.startswith(PREFIX):
        return None
    parts = custom_id[len(PREFIX):].split(":")
    action = parts[0]

    if action in _BARE_ACTIONS:
        if len(parts) != 1:
            return None
        return RaidCustomId(action=action, event_id=None)

    expected_args = _EVENT_ACTIONS.get(action)
    if expected_args is None or len(parts) != 2 + expected_args:
        return None
    try:
        event_id = uuid.UUID(parts[1])
    except ValueError:
        return None
    args = tuple(parts[2:])
    if action == "status":
        args = (_LEGACY_STATUSES.get(args[0], args[0]),)
    if not _args_valid(action, args):
        return None
    return RaidCustomId(action=action, event_id=event_id, args=args)


def _args_valid(action: str, args: tuple[str, ...]) -> bool:
    if action == "cls":
        return args[0] in POST_COLUMNS
    if action == "card":
        return args[0] in CARD_VIEWS
    if action == "status":
        return args[0] in REQUESTABLE_STATUSES
    if action in ("class", "pickclass"):
        return args[0] in _MENU_STATUSES
    if action == "release":
        return args[0] in RELEASE_STATUSES
    if action == "spec":
        column, status = args
        return column in POST_COLUMNS and status in _MENU_STATUSES
    if action == "role":
        status, wow_class, role = args
        return status in REQUESTABLE_STATUSES and wow_class in WOW_CLASSES and role in RAID_ROLES
    return True
