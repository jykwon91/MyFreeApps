"""Encode / parse the raid bot's component ``custom_id`` strings.

Scheme: ``raid:v1:<action>[:<event_uuid>][:<arg>...]`` — always ≤ 100
characters (Discord's limit).  Parsing is defensive: any malformed or
unknown id yields ``None`` and the caller answers with the generic error.

Actions
-------
signup   public [Sign up] button                     raid:v1:signup:<event>
status   public [Tentative]/[Late]/[Decline]          raid:v1:status:<event>:<status>
class    first-time class select (value = class)      raid:v1:class:<event>:<status>
role     class-filtered role button                   raid:v1:role:<event>:<status>:<class>:<role>
mine     public [My signup]                           raid:v1:mine:<event>
change   [Change class or role] on My signup          raid:v1:change:<event>
roster   public [Roster]                              raid:v1:roster:<event>
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

from app.models.wow.wow_raid_signup import RAID_ROLES, SIGNUP_STATUSES, WOW_CLASSES

PREFIX: Final = "raid:v1:"
MAX_CUSTOM_ID_LEN: Final = 100

# action → number of trailing args after the event id
_EVENT_ACTIONS: Final[dict[str, int]] = {
    "signup": 0,
    "status": 1,
    "class": 1,
    "role": 3,
    "mine": 0,
    "change": 0,
    "roster": 0,
    "confirm": 0,
    "discard": 0,
    "cancel": 0,
    "keep": 0,
}
_BARE_ACTIONS: Final = frozenset({"testdm"})

# Statuses a member can request from a button (bench is assigned, never requested).
REQUESTABLE_STATUSES: Final = tuple(s for s in SIGNUP_STATUSES if s != "bench")


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
    if not _args_valid(action, args):
        return None
    return RaidCustomId(action=action, event_id=event_id, args=args)


def _args_valid(action: str, args: tuple[str, ...]) -> bool:
    if action in ("status", "class"):
        return args[0] in REQUESTABLE_STATUSES
    if action == "role":
        status, wow_class, role = args
        return status in REQUESTABLE_STATUSES and wow_class in WOW_CLASSES and role in RAID_ROLES
    return True
