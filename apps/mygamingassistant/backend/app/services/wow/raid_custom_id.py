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
cp       Raid: Edit's [Copy raid]                     raid:v1:cp:<event>
rp       the Repeat card (Raid: Edit's [Repeat],      raid:v1:rp:<event>:<verb>  (see ``REPEAT_VERBS``)
         the "Posted" message's [Repeat this raid])
rpl      /raid-admin repeats' menu (the value is      raid:v1:rpl
         the repeat's latest raid)
xt       the Event & thread card (More options and   raid:v1:xt:<event>:<verb>  (see ``EXTRAS_VERBS``)
         Raid: Edit's [Event & thread])
m        a modal's submit                             raid:v1:m:<event>:<ping|title|when|desc|image|cancel|
                                                                         role_limits|class_limits|char|
                                                                         note|reason|deadline|length|copy|
                                                                         repeat_days|repeat_next|uping>
         (``uping`` = Raid: Unsigned's [Ping them] form)
ml       Manage sign-ups (a leader adds, changes,      raid:v1:ml:<event>:<verb>:<member|->:<arg|->
         moves and removes players; see ``MANAGE_VERBS``)
testdm   /raid prefs [Send me a test DM]              raid:v1:testdm
mr       Raid: Manage's raid picker (the value is     raid:v1:mr
         ``<event>:<member>``: the raid, and the player to manage on it)
at       the Attendance card (Raid: Signed's          raid:v1:at:<event>:<verb>:<member|->:<arg|->
         [Attendance]) and its player card; see ``ATTENDANCE_VERBS``
as       /raid-admin attendance's summary: [Previous]  raid:v1:as:<page|csv>:<raid|->:<count>:<0|1>:<page|->
         / [Next] and [Export CSV], carrying the window (no raid: the guild is the interaction's)
un       Raid: Unsigned's list (Raid: Signed's        raid:v1:un:<event>:<verb>  (see ``UNSIGNED_VERBS``)
         [Not signed up]): its role menu, [Ping them], [Refresh] and [Back]
rr       /raid-admin raiders' role menu               raid:v1:rr
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Final

from app.models.wow.wow_raid_signup import RAID_ROLES, WOW_CLASSES
from app.services.wow.raid_attendance import PLAYER_MENUS, SETTABLE_OUTCOMES, WindowQuery
from app.services.wow.raid_catalog import POST_COLUMNS, SPECS
from app.services.wow.raid_roster import (
    BENCH_STATUS,
    QUEUED_STATUS,
    REQUESTABLE_STATUSES,
    SEAT_STATUSES,
    TENTATIVE_STATUS,
)

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
    "cp": 0,
    "rp": 1,
    "xt": 1,
    "at": 3,
    "un": 1,
}
# Raid: Manage's raid picker; its option values carry the raid and the player.
RAID_PICK: Final = "mr"
# /raid-admin repeats' menu; its option values are a repeat's latest raid.
REPEATS_PICK: Final = "rpl"
# /raid-admin raiders' role menu: the server's raider roles.
RAIDERS_PICK: Final = "rr"
_BARE_ACTIONS: Final = frozenset({"testdm", RAID_PICK, REPEATS_PICK, RAIDERS_PICK})
# action → number of args, with no event id: the attendance summary (``as``).
_SERVER_ACTIONS: Final[dict[str, int]] = {"as": 5}
# Every action a component can carry (the router's table matches it).
ROUTED_ACTIONS: Final = frozenset(_EVENT_ACTIONS) | _BARE_ACTIONS | frozenset(_SERVER_ACTIONS)

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
    "more", "preview", "mentions", "noping", "role_limits", "class_limits", "notes_on", "notes_off", "deadline",
)
# The Repeat card: open it, its How often? and When should I post? menus, [Skip <date>],
# [Change next date] (its form), [Stop repeating] and [Back] (to Raid: Edit's card).
REPEAT_VERBS: Final = ("open", "every", "ahead", "skip", "next", "stop", "back")
# The Event & thread card: open it, its toggles (each naming the state it switches to),
# [Length] (its form) and [Try again].  Its [Back] is Raid: Edit's ``back``.
EXTRAS_VERBS: Final = ("open", "event_on", "event_off", "thread_on", "thread_off", "length", "retry")
# Raid: Unsigned's list: open it ([Not signed up]), [Refresh], its role menu, [Ping them]
# (the form) and [Back] (to Raid: Signed).
UNSIGNED_VERBS: Final = ("open", "refresh", "roles", "ping", "back")
# Raid: Edit's menus, and the create preview's role menu.
PICKERS: Final = ("leader", "color", "mentions")
# The modals the bot opens; a submit names which one it came from.
MODALS: Final = (
    "ping", "title", "when", "desc", "image", "cancel", "role_limits", "class_limits", "char", "note", "reason",
    "deadline", "length", "copy", "repeat_days", "repeat_next", "uping",
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
#   markt / markq  [Move and tell them] / [Move quietly] (arg = the status, or ``queued`` on the queue review)
#   addr / dropr / markr  [Add / Remove / Move and say why]: the form, then the change (args as addt / dropt /
#         markt; the form's custom_id is the button's own)
#   swap  [Seat] on a full raid: the menu of seat holders (its value is the one to bench)
#   hold  that menu's [Previous] / [Next] (arg = the page)   queue  its [Queue them instead]
#   swapt / swapq / swapr  [Swap and tell them] / [Swap quietly] / [Swap and say why] (arg = the seat holder)
MANAGE_HUB_VERBS: Final = ("open", "who", "done", "row", "list")
_ADD_VERBS: Final = ("addt", "addq", "addr")
_MARK_VERBS: Final = ("mark", "markt", "markq", "markr")
_SWAP_VERBS: Final = ("swapt", "swapq", "swapr")
MANAGE_VERBS: Final = (
    *MANAGE_HUB_VERBS, "card", "class", "spec", "ask", *_ADD_VERBS, "dropt", "dropq", "dropr", *_MARK_VERBS,
    "swap", "hold", "queue", *_SWAP_VERBS,
)
MANAGE_MAX_PAGE: Final = 99
# What a leader can move a player to; the queue is the bot's to give.
MARK_STATUSES: Final = (*SEAT_STATUSES, TENTATIVE_STATUS, BENCH_STATUS)
# What a review's [Move ...] can carry: those, or ``queued`` from [Queue them instead] (a seat asked
# for that waits in the queue while the raid is full).
_MOVE_STATUSES: Final = (*MARK_STATUSES, QUEUED_STATUS)
NO_ARG: Final = "-"
# The Attendance card (``at``): verb → what its <member> / <arg> hold.  The card's own verbs
# name nobody (``-``):
#   open  the card (Raid: Signed's [Attendance], the player card's [Back])
#   add   its "Add people who came…" menu   record  [Record now]   csv  [Export CSV]
#   count / nocount  [Count this raid] / [Don't count this raid]
#   who   its player menus (arg = which menu, 1 to PLAYER_MENUS; the value is the member)
# The player card's name the member:
#   set   [Attended] [Late] [Standby] [No-show] [Absent] (arg = one of SETTABLE_OUTCOMES)
#   drop  [Remove] (a walk-in a leader added)
ATTENDANCE_HUB_VERBS: Final = ("open", "add", "record", "count", "nocount", "csv")
ATTENDANCE_VERBS: Final = (*ATTENDANCE_HUB_VERBS, "who", "set", "drop")
_PLAYER_MENU_ARGS: Final = tuple(str(menu) for menu in range(1, PLAYER_MENUS + 1))
# The summary (``as``): [Previous] / [Next] (with the page) and [Export CSV] (page ``-``).
SUMMARY_VERBS: Final = ("page", "csv")
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


def attendance(event_id: uuid.UUID, verb: str, member: str = NO_ARG, arg: str = NO_ARG) -> str:
    """An Attendance card custom_id: ``raid:v1:at:<event>:<verb>:<member>:<arg>``."""
    return encode("at", event_id, verb, member, arg)


def summary(verb: str, query: WindowQuery, page: str = NO_ARG) -> str:
    """An attendance summary custom_id: ``raid:v1:as:<verb>:<raid|->:<count>:<0|1>:<page|->``."""
    return encode("as", None, verb, *query.to_args(), page)


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

    server_args = _SERVER_ACTIONS.get(action)
    if server_args is not None:
        args = tuple(parts[1:])
        if len(args) != server_args or not _summary_args_valid(*args):
            return None
        return RaidCustomId(action=action, event_id=None, args=args)

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
    if action == "rp":
        return args[0] in REPEAT_VERBS
    if action == "xt":
        return args[0] in EXTRAS_VERBS
    if action == "un":
        return args[0] in UNSIGNED_VERBS
    if action == "m":
        return args[0] in MODALS
    if action == "ml":
        return _manage_args_valid(*args)
    if action == "at":
        return _attendance_args_valid(*args)
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
    if verb == "mark":
        return arg in MARK_STATUSES
    if verb in _MARK_VERBS:
        return arg in _MOVE_STATUSES
    if verb == "hold":
        return _is_page(arg)
    if verb in _SWAP_VERBS:
        return is_member_id(arg) and arg != member
    return arg == NO_ARG


def _attendance_args_valid(verb: str, member: str, arg: str) -> bool:
    """The card's verbs name nobody (``who`` carries its menu); ``set`` and ``drop`` name a member."""
    if verb in ATTENDANCE_HUB_VERBS:
        return member == NO_ARG and arg == NO_ARG
    if verb == "who":
        return member == NO_ARG and arg in _PLAYER_MENU_ARGS
    if verb not in ATTENDANCE_VERBS or not is_member_id(member):
        return False
    if verb == "set":
        return arg in SETTABLE_OUTCOMES
    return arg == NO_ARG


def _summary_args_valid(verb: str, raid: str, count: str, bench: str, page: str) -> bool:
    """A window ``WindowQuery`` reads back, then the page for [Previous] / [Next] or ``-`` for [Export CSV]."""
    if verb not in SUMMARY_VERBS or WindowQuery.from_args(raid, count, bench) is None:
        return False
    if verb == "page":
        return _is_page(page)
    return page == NO_ARG


def _is_page(value: str) -> bool:
    """'1' up to MANAGE_MAX_PAGE, in ASCII digits with no leading zero."""
    return value.isascii() and value.isdecimal() and not value.startswith("0") and int(value) <= MANAGE_MAX_PAGE
