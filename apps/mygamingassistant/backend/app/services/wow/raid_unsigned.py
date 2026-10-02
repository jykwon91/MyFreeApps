"""Raid: Unsigned's rules — who should sign up for a raid, and who hasn't.

"Who should" is everyone holding one of the raid's *pool* of roles: the
roles picked for the raid, else the server's raider roles (``/raid-admin
raiders``), else the roles the raid pings.  ``@everyone`` never counts (its
id is the server's own), and a pool holds at most ``MAX_ROLES`` roles.  Bots
and members still on the server's rules screening don't count either.

Anyone with a sign-up row has answered — Absence included — so the unsigned
are the expected members without one.  Pure: the member list is read by
``app.services.discord.raid_member_list``.
"""
from __future__ import annotations

from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Final, Literal

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.wow.raid_catalog import CLASSES, CLASSES_BY_KEY
from app.services.wow.raid_deadline import deadline_due
from app.services.wow.raid_details import mention_roles
from app.services.wow.raid_event_service import PING_EVERY
from app.services.wow.raid_post_layout import NO_CLASS_COLUMN

# The most roles a pool holds (the role menus' limit too).
MAX_ROLES: Final = 10
# The most people one [Ping them] mentions; past it the leader picks narrower roles.
MAX_PING: Final = 200
# Members per page of Discord's member list, and the most pages read (10,000 members).
PAGE_SIZE: Final = 1000
MAX_PAGES: Final = 10
# How long reading the whole list may take, in seconds.
FETCH_BUDGET_S: Final = 25.0

PoolSource = Literal["raid", "server", "pings"]
PingBlock = Literal["started", "closed", "cancelled", "nobody", "too_many"]


@dataclass(frozen=True)
class Member:
    """A server member, as far as Unsigned needs one."""

    user_id: str
    name: str  # their name in the server: nickname, else display name, else username
    role_ids: frozenset[str]
    bot: bool = False
    pending: bool = False  # still on the server's rules screening


@dataclass(frozen=True)
class MemberList:
    """The members read, and whether reading stopped at ``MAX_PAGES`` pages."""

    members: tuple[Member, ...]
    truncated: bool = False


@dataclass(frozen=True)
class Pool:
    """The roles checked, and where they came from (None: no roles anywhere)."""

    role_ids: tuple[str, ...]
    source: PoolSource | None


def pool_for(event: WowRaidEvent, guild: WowRaidGuild) -> Pool:
    """The roles picked for the raid, else :func:`default_pool`."""
    own = _cleaned(event.raider_role_ids or (), guild.discord_guild_id)
    if own:
        return Pool(own, "raid")
    return default_pool(event, guild)


def default_pool(event: WowRaidEvent, guild: WowRaidGuild) -> Pool:
    """What a raid without roles of its own checks: the server's raider roles, else the roles it pings."""
    server = _cleaned(guild.raider_role_ids or (), guild.discord_guild_id)
    if server:
        return Pool(server, "server")
    pings = _cleaned(mention_roles(event, guild), guild.discord_guild_id)
    if pings:
        return Pool(pings, "pings")
    return Pool((), None)


def known_pool(pool: Pool, role_ids_in_server: Collection[str]) -> tuple[Pool, bool]:
    """*pool* without roles the server no longer has, and whether any were dropped."""
    kept = tuple(role_id for role_id in pool.role_ids if role_id in role_ids_in_server)
    return Pool(kept, pool.source), len(kept) < len(pool.role_ids)


def expected(members: Iterable[Member], pool: Pool) -> list[Member]:
    """The members who should sign up: people (not bots) past the screening, holding a pool role."""
    wanted = frozenset(pool.role_ids)
    return [member for member in members if not member.bot and not member.pending and member.role_ids & wanted]


def unsigned(expected_members: Iterable[Member], signed_ids: Collection[str]) -> list[Member]:
    """The expected members with no sign-up at all (an Absence counts as an answer)."""
    return [member for member in expected_members if member.user_id not in signed_ids]


def by_class(members: Iterable[Member], classes: Mapping[str, str]) -> list[tuple[str, list[Member]]]:
    """*members* under the class they last signed up as (*classes*: user id → class).

    In the catalog's class order, "No class yet" last; names in alphabetical
    order, ignoring case.
    """
    columns: dict[str, list[Member]] = {}
    for member in sorted(members, key=lambda member: (member.name.casefold(), member.user_id)):
        column = classes.get(member.user_id, NO_CLASS_COLUMN)
        if column not in CLASSES_BY_KEY:
            column = NO_CLASS_COLUMN
        columns.setdefault(column, []).append(member)
    order = [*(info.key for info in CLASSES), NO_CLASS_COLUMN]
    return [(column, columns[column]) for column in order if column in columns]


def ping_block(event: WowRaidEvent, now: datetime, count: int) -> PingBlock | None:
    """Why [Ping them] can't go out for *count* unsigned members; None when it can."""
    block = raid_block(event, now)
    if block is not None:
        return block
    if count == 0:
        return "nobody"
    if count > MAX_PING:
        return "too_many"
    return None


def raid_block(event: WowRaidEvent, now: datetime) -> PingBlock | None:
    """Why the raid itself takes no ping (it started, isn't on, or sign-ups closed); None when it does."""
    if event.starts_at <= now:
        return "started"
    if event.status != "scheduled":
        return "cancelled"
    if event.closed_at is not None or deadline_due(event, now):
        return "closed"
    return None


def ping_ready(event: WowRaidEvent, now: datetime) -> bool:
    """False while the raid's last Unsigned ping is under ``PING_EVERY`` old."""
    return event.unsigned_pinged_at is None or now - event.unsigned_pinged_at >= PING_EVERY


def picked_roles(values: Sequence[str], *, everyone_id: str | None) -> tuple[list[str], bool]:
    """The roles a role menu picked, up to ``MAX_ROLES``, and whether ``@everyone`` was among them (left out)."""
    roles: list[str] = []
    everyone = False
    for value in values:
        if value == everyone_id:
            everyone = True
        elif value.isascii() and value.isdigit() and value not in roles:
            roles.append(value)
    return roles[:MAX_ROLES], everyone


def _cleaned(role_ids: Iterable[object], everyone_id: str) -> tuple[str, ...]:
    """*role_ids* as strings, without ``@everyone`` or repeats, the first ``MAX_ROLES``."""
    kept: list[str] = []
    for role_id in map(str, role_ids):
        if role_id != everyone_id and role_id not in kept:
            kept.append(role_id)
    return tuple(kept[:MAX_ROLES])
