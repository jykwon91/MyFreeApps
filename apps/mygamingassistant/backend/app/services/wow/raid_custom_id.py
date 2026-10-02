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
card     My sign-up's [Full roster] / [Back] /        raid:v1:card:<event>:<view>
         [Character name] (its form) / [Forget my specs] and its [Yes, forget them] /
         [Add note] / [Edit note] (its form) / [Add reason] (the note form, from the reply to a tap)
         (view = roster, back, char, forget, forgetyes, note or reason)
signup   [Sign up] on posts from before the class buttons   raid:v1:signup:<event>
roster   [Roster] on posts from before the class buttons    raid:v1:roster:<event>
role     role button from a pre-spec picker (legacy)  raid:v1:role:<event>:<status>:<class>:<role>
release  [Yes, free my seat] on the seat confirm      raid:v1:release:<event>:<status>
stay     [Keep my seat] on the seat confirm           raid:v1:stay:<event>
confirm  create preview [Post raid]                   raid:v1:confirm:<event>
discard  create preview [Cancel]                      raid:v1:discard:<event>
         (its [More options] are Raid: Edit's ``ed`` / ``pick`` / ``m`` on the draft)
cancel   cancel flow [Cancel raid]                    raid:v1:cancel:<event>
keep     cancel flow [Keep raid]                      raid:v1:keep:<event>
lc       Raid: Close / Raid: Signed leader buttons    raid:v1:lc:<event>:<reopen|close|ping|notify>
         (``notify`` = [Tell them in channel] after Raid: Edit moved the raid)
ed       Raid: Edit's buttons                         raid:v1:ed:<event>:<property|cancel|delete|done|back|keep|more|preview>
         (``keep`` = [Keep raid] on the cancel check opened from Raid: Edit;
         ``more`` / ``preview`` = the create preview's [More options] and its [Back];
         ``mentions`` (who the raid pings) and its [No ping] (``noping``) are on drafts only;
         ``notes_on`` / ``notes_off`` = [Notes: off] / [Notes: on], naming the state it switches to)
pick     Raid: Edit's leader / color menus            raid:v1:pick:<event>:<leader|color|mentions>
del      [Delete raid] on Raid: Edit's delete check   raid:v1:del:<event>
m        a modal's submit                             raid:v1:m:<event>:<ping|title|when|desc|image|cancel|
                                                                         role_limits|class_limits|char|
                                                                         note|reason>
ml       Manage sign-ups (a leader adds, changes,      raid:v1:ml:<event>:<verb>:<member|->:<arg|->
         moves and removes players; see ``MANAGE_VERBS``)
testdm   /raid prefs [Send me a test DM]              raid:v1:testdm
mr       Raid: Manage's raid picker (the value is     raid:v1:mr
         ``<event>:<member>``: the raid, and the player to manage on it)
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Final

from app.models.wow.wow_raid_signup import RAID_ROLES, WOW_CLASSES
from app.services.wow.raid_catalog import POST_COLUMNS, SPECS
from app.services.wow.raid_roster import BENCH_STATUS, REQUESTABLE_STATUSES, SEAT_STATUSES, TENTATIVE_STATUS

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
    "lc": 1,
    "ed": 1,
    "pick": 1,
    "del": 0,
    "m": 1,
    "ml": 3,
}
# Raid: Manage's raid picker; its option values carry the raid and the player.
RAID_PICK: Final = "mr"
_BARE_ACTIONS: Final = frozenset({"testdm", RAID_PICK})

# A menu opened from My sign-up: keep whatever status you have when you pick.
SAME_STATUS: Final = "same"
# What the class / spec menus can carry: the status asked for, or ``same``.
_MENU_STATUSES: Final = (*REQUESTABLE_STATUSES, SAME_STATUS)
# What a seat holder can give their seat up for (the confirm card's [Yes]).
RELEASE_STATUSES: Final = ("tentative", "bench", "absence")
# The My sign-up card's views: the full roster, back to the card, the Character name form,
# Forget my specs (the card asking first, then its [Yes, forget them]), and the note form
# from the card ([Add note] / [Edit note]) or from the reply to a tap ([Add reason]).
CARD_VIEWS: Final = ("roster", "back", "char", "forget", "forgetyes", "note", "reason")
# The leader tools under Raid: Close / Raid: Signed (and [Tell them in channel] under Raid: Edit).
LEADER_ACTIONS: Final = ("reopen", "close", "ping", "notify")
# Raid: Edit's buttons: a property to change, cancel / delete the raid, close / return to
# the card, or keep the raid after starting to cancel it.  The create preview uses them
# too: [More options] opens its card, [Back] there goes back to the preview, and
# [Mentions] (who the raid pings) and its [No ping] are offered on drafts only.  The notes
# switch names the state it turns notes to, so a card that sat open can't flip them back.
EDIT_ACTIONS: Final = (
    "title", "leader", "when", "desc", "image", "color", "cancel", "delete", "done", "back", "keep",
    "more", "preview", "mentions", "noping", "role_limits", "class_limits", "notes_on", "notes_off",
)
# Raid: Edit's menus, and the create preview's role menu.
PICKERS: Final = ("leader", "color", "mentions")
# The modals the bot opens; a submit names which one it came from.
MODALS: Final = (
    "ping", "title", "when", "desc", "image", "cancel", "role_limits", "class_limits", "char", "note", "reason",
)
# Manage sign-ups (``ml``): verb → what its <arg> holds.  The hub's verbs name no
# member (``-``); every other verb names the member it's about.
#   open  the hub (Raid: Edit's [Sign-ups], Raid: Signed's [Manage sign-ups], [Back])
#   who   the hub's member menu          done  the hub's [Done]
#   row   the hub's menu of the raid's sign-ups (its value is the member)
#   list  the hub's [Previous] / [Next] (arg = the page, 1 to MANAGE_MAX_PAGE)
#   card  [Back] to the member's card    class  the card's class menu
#   spec  the spec menu (arg = column)   ask    the card's [Remove]
#   addt / addq  [Add and tell them] / [Add quietly] (arg = <class>.<spec>)
#   dropt / dropq  [Remove and tell them] / [Remove quietly]
#   mark  the card's [Seat] [Late] [Tentative] [Bench] (arg = the status, one of MARK_STATUSES)
#   markt / markq  [Move and tell them] / [Move quietly] (arg = the status)
#   addr / dropr / markr  [Add / Remove / Move and say why]: the form, then the change (args as addt / dropt /
#         markt; the form's custom_id is the button's own)
MANAGE_HUB_VERBS: Final = ("open", "who", "done", "row", "list")
_ADD_VERBS: Final = ("addt", "addq", "addr")
_MARK_VERBS: Final = ("mark", "markt", "markq", "markr")
MANAGE_VERBS: Final = (
    *MANAGE_HUB_VERBS, "card", "class", "spec", "ask", *_ADD_VERBS, "dropt", "dropq", "dropr", *_MARK_VERBS
)
MANAGE_MAX_PAGE: Final = 99
# What a leader can move a player to; the queue is the bot's to give.
MARK_STATUSES: Final = (*SEAT_STATUSES, TENTATIVE_STATUS, BENCH_STATUS)
NO_ARG: Final = "-"
_SPEC_CHOICES: Final = frozenset(spec.choice_value for spec in SPECS)
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


def manage(event_id: uuid.UUID, verb: str, member: str = NO_ARG, arg: str = NO_ARG) -> str:
    """A Manage sign-ups custom_id: ``raid:v1:ml:<event>:<verb>:<member>:<arg>``."""
    return encode("ml", event_id, verb, member, arg)


def is_member_id(value: str) -> bool:
    """A Discord user id: 15–20 ASCII digits."""
    return value.isascii() and value.isdecimal() and 15 <= len(value) <= 20


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
    if action == "lc":
        return args[0] in LEADER_ACTIONS
    if action == "ed":
        return args[0] in EDIT_ACTIONS
    if action == "pick":
        return args[0] in PICKERS
    if action == "m":
        return args[0] in MODALS
    if action == "ml":
        return _manage_args_valid(*args)
    if action == "spec":
        column, status = args
        return column in POST_COLUMNS and status in _MENU_STATUSES
    if action == "role":
        status, wow_class, role = args
        return status in REQUESTABLE_STATUSES and wow_class in WOW_CLASSES and role in RAID_ROLES
    return True


def _manage_args_valid(verb: str, member: str, arg: str) -> bool:
    """The hub's verbs name nobody (``list`` carries a page); the rest name a member (a Discord id)."""
    if verb not in MANAGE_VERBS:
        return False
    if verb == "list":
        return member == NO_ARG and _is_page(arg)
    if verb in MANAGE_HUB_VERBS:
        return member == NO_ARG and arg == NO_ARG
    if not is_member_id(member):
        return False
    if verb == "spec":
        return arg in POST_COLUMNS
    if verb in _ADD_VERBS:
        return arg in _SPEC_CHOICES
    if verb in _MARK_VERBS:
        return arg in MARK_STATUSES
    return arg == NO_ARG


def _is_page(value: str) -> bool:
    """'1' up to MANAGE_MAX_PAGE, in ASCII digits with no leading zero."""
    return value.isascii() and value.isdecimal() and not value.startswith("0") and int(value) <= MANAGE_MAX_PAGE
