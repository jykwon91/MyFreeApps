"""Raid: Edit → Advanced — who can sign up, a minimum, the ready check: the rules (pure).

Every setting reads raid → server → built-in, every time (:func:`resolve`):
a raid column that's NULL follows the server, and any value — "everyone",
"off" — is the raid's own.  A server value that's NULL falls back to the
built-in default.  Nothing is snapshotted when a raid is made, so a server
change reaches every raid that follows it.

* **Who can sign up** — an allowed list (only these roles may join; empty =
  everyone) and a banned list (these roles may not; banned wins).  Checked
  when a member joins (``raid_context.join_refusal``): anyone already on the
  raid, its leader and Manage Events always pass.  The post says who it's
  open to (:func:`post_lines`); banned roles aren't shown.
* **Minimum sign-ups** — raid-only, since it cancels the raid: checked once,
  when sign-ups close by themselves (``raid_sweeps``), against the seats
  taken — at most the raid's size (:func:`needed`).
* **Ready check** — minutes before the start (0 = none).  The server's is
  ``wow_raid_guild.settings["ready_check_minutes"]``; the scheduler reads the
  raid's through :func:`notification_settings`.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final, Generic, Literal, TypeVar

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.wow.raid_roles import stored_roles

T = TypeVar("T")
Source = Literal["raid", "server", "built_in"]
# Which role list: who may join (``signup``), or who may not (``banned``).
RoleList = Literal["signup", "banned"]

# The ready check when neither the raid nor the server sets one.
READY_CHECK_DEFAULT: Final = 60
# The Ready check menu's times, in minutes before the start; 0 = off.
READY_CHOICES: Final = (0, 15, 30, 45, 60, 90, 120, 180)
# A raid's Ready check menu value for "follow the server".
INHERIT: Final = "inherit"
# The settings on a raid's Advanced card, and on /raid-admin advanced.
SETTING_KEYS: Final = ("min", "who", "ready")
SERVER_KEYS: Final = ("who", "ready")


@dataclass(frozen=True)
class Effective(Generic[T]):
    """A setting's value, and whose it is."""

    value: T
    source: Source


def resolve(raid: T | None, server: T | None, built_in: T) -> Effective[T]:
    """The first of the raid's, the server's and the built-in value that isn't None."""
    if raid is not None:
        return Effective(raid, "raid")
    if server is not None:
        return Effective(server, "server")
    return Effective(built_in, "built_in")


def signup_roles(event: WowRaidEvent, guild: WowRaidGuild) -> Effective[tuple[str, ...]]:
    """The roles that may join; empty = everyone."""
    return _roles(event.signup_role_ids, guild.signup_role_ids, guild)


def banned_roles(event: WowRaidEvent, guild: WowRaidGuild) -> Effective[tuple[str, ...]]:
    """The roles that may not join; empty = nobody."""
    return _roles(event.banned_role_ids, guild.banned_role_ids, guild)


def server_roles(guild: WowRaidGuild, which: RoleList) -> tuple[str, ...]:
    """The server's own allowed or banned list (empty when it has none)."""
    stored = guild.signup_role_ids
    if which == "banned":
        stored = guild.banned_role_ids
    return stored_roles(stored or (), guild.discord_guild_id)


def own_roles(event: WowRaidEvent, guild: WowRaidGuild, which: RoleList) -> tuple[str, ...]:
    """The raid's own allowed or banned list (empty while it follows the server)."""
    stored = event.signup_role_ids
    if which == "banned":
        stored = event.banned_role_ids
    return stored_roles(stored or (), guild.discord_guild_id)


def _roles(
    raid: Sequence[object] | None, server: Sequence[object] | None, guild: WowRaidGuild
) -> Effective[tuple[str, ...]]:
    found = resolve(raid, server, ())
    return Effective(stored_roles(found.value, guild.discord_guild_id), found.source)


def server_ready_check(guild: WowRaidGuild) -> int:
    """The server's ready check, in minutes before the start (0 = none)."""
    return _ready_check_of(None, guild).value


def ready_check(event: WowRaidEvent, guild: WowRaidGuild) -> Effective[int]:
    """The raid's ready check, in minutes before the start (0 = none)."""
    return _ready_check_of(event.ready_check_minutes, guild)


def _ready_check_of(raid: int | None, guild: WowRaidGuild) -> Effective[int]:
    server = (guild.settings or {}).get("ready_check_minutes")
    return resolve(raid, server, READY_CHECK_DEFAULT)


def notification_settings(event: WowRaidEvent, guild: WowRaidGuild) -> dict[str, Any]:
    """The guild's settings with the raid's ready check: what the notification scheduler reads."""
    return {**(guild.settings or {}), "ready_check_minutes": ready_check(event, guild).value}


@dataclass(frozen=True)
class AccessRefusal:
    """Why a member may not join: a banned role they hold, or none of the allowed ones (*roles*)."""

    kind: Literal["banned", "not_allowed"]
    roles: tuple[str, ...]


def access_refusal(event: WowRaidEvent, guild: WowRaidGuild, member_role_ids: Sequence[str]) -> AccessRefusal | None:
    """Why a member holding *member_role_ids* may not join, or None when they may.  Banned wins."""
    held = set(member_role_ids)
    barred = tuple(role_id for role_id in banned_roles(event, guild).value if role_id in held)
    if barred:
        return AccessRefusal("banned", barred)
    allowed = signup_roles(event, guild).value
    if allowed and held.isdisjoint(allowed):
        return AccessRefusal("not_allowed", allowed)
    return None


def post_lines(event: WowRaidEvent, guild: WowRaidGuild) -> list[str]:
    """The post's "Open to: <@&a> <@&b>" while an allowed list applies (embeds never ping)."""
    allowed = signup_roles(event, guild).value
    if not allowed:
        return []
    return ["Open to: " + " ".join(f"<@&{role_id}>" for role_id in allowed)]


def needed(event: WowRaidEvent) -> int | None:
    """The seats the raid needs when sign-ups close: its minimum, at most its size; None without one."""
    if event.min_signups is None:
        return None
    return min(event.min_signups, event.size_cap)


@dataclass(frozen=True)
class Shortfall:
    seats: int
    needed: int


def shortfall(event: WowRaidEvent, seats_taken: int) -> Shortfall | None:
    """How short the raid is of its minimum with *seats_taken*; None when it isn't (or has none)."""
    need = needed(event)
    if need is None or seats_taken >= need:
        return None
    return Shortfall(seats_taken, need)


def short_reason(short: Shortfall) -> str:
    """The cancel reason a minimum's cancel gives (the post and the DMs show it)."""
    return f"Not enough sign-ups: {short.seats} of {short.needed} needed."


@dataclass(frozen=True)
class MinimumProblem:
    """Why the Minimum form's text isn't a minimum: not a number, zero, or above the raid's *cap*."""

    kind: Literal["number", "zero", "too_big"]
    cap: int


def parse_minimum(text: str, size_cap: int) -> int | None | MinimumProblem:
    """The Minimum form: empty = no minimum; else a whole number from 1 to the raid's size."""
    value = text.strip()
    if not value:
        return None
    if not (value.isascii() and value.isdecimal()):
        return MinimumProblem("number", size_cap)
    number = int(value)
    if number == 0:
        return MinimumProblem("zero", size_cap)
    if number > size_cap:
        return MinimumProblem("too_big", size_cap)
    return number


def ready_choice(value: str, *, raid: bool) -> int | Literal["inherit"] | None:
    """A Ready check menu value: minutes, ``inherit`` (a raid's menu only), or None when it isn't one."""
    if raid and value == INHERIT:
        return INHERIT
    return next((minutes for minutes in READY_CHOICES if str(minutes) == value), None)
