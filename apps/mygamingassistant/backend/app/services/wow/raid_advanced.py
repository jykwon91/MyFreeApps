"""Raid: Edit → Advanced — who can sign up, a minimum, the ready check, the post's options: the rules (pure).

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
* **Pin the post** — pinned while the raid is still to start, unpinned at
  the start or a cancel (:func:`pin_step`).  Only the bot's own pin is ever
  undone, so a member's pin stays.
* **Voice channel** — the post links it ("Voice: <#id>"); a raid's
  ``NO_VOICE`` is its own "none" although the server has one.
* **Delete the post** — raid-only, like the minimum, since it deletes: this
  many hours after the raid ends, once it's completed or cancelled
  (``raid_sweeps``).  The raid itself stays.
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
SETTING_KEYS: Final = ("min", "who", "ready", "pin", "voice", "del")
SERVER_KEYS: Final = ("who", "ready", "pin", "voice")
# A raid's voice channel "none", although the server has one.
NO_VOICE: Final = "0"
# The Delete the post menu's delays, in hours after the raid ends; ``keep`` keeps the post.
DELETE_CHOICES: Final = (3, 6, 12, 24, 48, 168)
KEEP: Final = "keep"
# What the post's pin needs: pin it, undo the bot's pin, or forget the pin of a post that's gone.
PinStep = Literal["pin", "unpin", "forget"]


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
    """The post's "Open to: <@&a> <@&b>" while an allowed list applies, then "Voice: <#id>" (embeds never ping)."""
    lines: list[str] = []
    allowed = signup_roles(event, guild).value
    if allowed:
        lines.append("Open to: " + " ".join(f"<@&{role_id}>" for role_id in allowed))
    channel = voice_channel(event, guild).value
    if channel is not None:
        lines.append(f"Voice: <#{channel}>")
    return lines


@dataclass(frozen=True)
class PinResult:
    """What a pin sync's call came to: ``done``, or why not — no Pin Messages, a full pin list, no answer."""

    step: Literal["pin", "unpin"]
    kind: Literal["done", "permission", "full", "failed"]
    channel_id: str


def pin_setting(event: WowRaidEvent, guild: WowRaidGuild) -> Effective[bool]:
    """Whether the raid's post is pinned while the raid is still to start (off unless set)."""
    return resolve(event.pin_post, guild.pin_posts, False)


def pin_wanted(event: WowRaidEvent, guild: WowRaidGuild) -> bool:
    """The post is to be pinned: the setting is on, and the raid is posted and still to start."""
    return bool(pin_setting(event, guild).value) and event.status == "scheduled" and event.start_applied_at is None


def pin_step(event: WowRaidEvent, guild: WowRaidGuild) -> PinStep | None:
    """What the post's pin needs now; None when nothing.  Only the bot's own pin is undone.

    ``forget``: the bot's pin is of a post that's gone (deleted, or reposted);
    after it, the new post may still need its ``pin``.
    """
    pinned = event.pinned_message_id
    if pinned is not None and pinned != event.message_id:
        return "forget"
    wanted = pin_wanted(event, guild)
    if pinned is None and event.message_id is not None and wanted:
        return "pin"
    if pinned is not None and not wanted:
        return "unpin"
    return None


def voice_channel(event: WowRaidEvent, guild: WowRaidGuild) -> Effective[str | None]:
    """The voice channel the post links; None = none.  A raid's ``NO_VOICE`` is its own "none"."""
    if event.voice_channel_id == NO_VOICE:
        return Effective(None, "raid")
    return resolve(event.voice_channel_id, guild.voice_channel_id, None)


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


def delete_choice(value: str) -> int | Literal["keep"] | None:
    """A Delete the post menu value: hours after the raid, ``keep``, or None when it isn't one."""
    if value == KEEP:
        return KEEP
    return next((hours for hours in DELETE_CHOICES if str(hours) == value), None)


def voice_choice(values: Sequence[str]) -> str | None:
    """The voice channel a channel menu picked (a Discord id); None when it holds none."""
    picked = next(iter(values), "")
    if picked.isascii() and picked.isdecimal() and 15 <= len(picked) <= 20:
        return picked
    return None
