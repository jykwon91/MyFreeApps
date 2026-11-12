"""Refresh watched guilds' rosters, and their members' characters, on a schedule.

A guild is watched while someone looked up one of its members on "Your
character" within ``GUILD_TRACKED_FOR``. Each run (``refresh_wow_guild_rosters``)
takes up to ``GUILD_ROSTER_MAX_GUILDS_PER_RUN`` watched guilds whose roster is
older than ``GUILD_ROSTER_STALE_AFTER``, never-asked first, and fetches at most
``GUILD_ROSTER_MAX_MEMBER_FETCHES_PER_RUN`` members across them (the Blizzard
quota is shared with every other caller). Per guild:

1. Blizzard's guild and roster. Two 404s in a row, or the name now belonging to
   another guild, mark the guild gone and its members guildless; any other
   failure, or an answer we can't mostly read, is kept as ``last_error`` (the
   stored roster stays) and retried when next due;
2. the members not refreshed within ``GUILD_ROSTER_STALE_AFTER``, a few at a
   time and within the run's budget, through ``character_lookup_service``, so
   each is stored exactly as a page look-up stores it (a member that fails is
   recorded there and skipped). A big guild is finished over its next refreshes;
3. one short transaction: the member count, and the stored members become
   exactly the roster, each with its rank.

A guild that fails unexpectedly is recorded and the run goes on; a 429 from
Blizzard ends the run. No database connection is held while Blizzard answers.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.core.wow_character import CHARACTER_ERROR_MAX_LENGTH
from app.core.wow_guild import (
    GUILD_MEMBER_FETCH_CONCURRENCY,
    GUILD_NOT_FOUND_ERROR,
    GUILD_ROSTER_MAX_GUILDS_PER_RUN,
    GUILD_ROSTER_MAX_MEMBER_FETCHES_PER_RUN,
    GUILD_ROSTER_STALE_AFTER,
    GUILD_TRACKED_FOR,
)
from app.db.session import unit_of_work
from app.models.wow.guild import WowGuild
from app.repositories.wow import character_repo, guild_repo
from app.services.wow.character import character_lookup_service, character_service
from app.services.wow.character.character_lookup_error import CharacterLookupError
from app.services.wow.guild.guild_mapper import to_guild_identity, to_roster
from app.services.wow.guild.guild_refresh_outcome import GuildRefreshOutcome
from app.services.wow.guild.guild_roster import GuildRoster
from app.services.wow.guild.guild_roster_member import GuildRosterMember

logger = logging.getLogger(__name__)

_NOTHING_FETCHED = GuildRefreshOutcome(fetched=0, rate_limited=False)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def refresh_due(*, now: datetime | None = None) -> int:
    """Refresh the guilds that are due; returns how many were attempted."""
    at = now or _now()
    async with unit_of_work() as db:
        due = await guild_repo.due_for_roster(
            db,
            viewed_since=at - GUILD_TRACKED_FOR,
            checked_before=at - GUILD_ROSTER_STALE_AFTER,
            limit=GUILD_ROSTER_MAX_GUILDS_PER_RUN,
        )
    budget = GUILD_ROSTER_MAX_MEMBER_FETCHES_PER_RUN
    attempted = 0
    for guild in due:
        if budget <= 0:
            break
        attempted += 1
        try:
            outcome = await refresh_guild(guild, budget=budget, now=at)
        except Exception:
            # One guild's bug must not stall the queue: record it so it waits its turn.
            logger.exception("Guild %s roster refresh failed", guild.slug)
            await _record_error(guild, "The roster refresh failed unexpectedly")
            continue
        budget -= outcome.fetched
        if outcome.rate_limited:
            logger.warning("wow guilds: Blizzard rate-limited the roster refresh; the rest wait for the next run")
            break
    logger.info("wow guilds: refreshed %d roster(s)", attempted)
    return attempted


async def refresh_guild(guild: WowGuild, *, budget: int, now: datetime | None = None) -> GuildRefreshOutcome:
    """Refresh one guild, fetching at most ``budget`` members."""
    at = now or _now()
    try:
        async with character_service.new_client() as client:
            info = await client.guild(guild.slug)
            raw_roster = await client.guild_roster(guild.slug)
    except CharacterLookupError as exc:
        if exc.status_code == httpx.codes.NOT_FOUND:
            await _not_found(guild)
            return _NOTHING_FETCHED
        await _record_error(guild, exc.summary())
        return GuildRefreshOutcome(fetched=0, rate_limited=exc.status_code == httpx.codes.TOO_MANY_REQUESTS)

    identity = to_guild_identity(info)
    roster = to_roster(raw_roster)
    if identity is None or not roster.members or len(roster.members) * 2 < roster.listed:
        # Never empty a guild, or drop most of it, on an answer we couldn't read.
        await _record_error(guild, "Blizzard's guild or roster answer was unreadable")
        return _NOTHING_FETCHED
    if identity.blizzard_guild_id != guild.blizzard_guild_id:
        # Blizzard gave the name to another guild: ours is gone. The new one is
        # stored when someone looks up one of its members.
        async with unit_of_work() as db:
            await guild_repo.mark_gone(db, guild.id, _now())
        logger.info("Guild %s is gone: Blizzard gave its name to another guild", guild.slug)
        return _NOTHING_FETCHED

    slugs = await _members_to_fetch(roster.members, budget, at)
    rate_limited = asyncio.Event()
    limit = asyncio.Semaphore(GUILD_MEMBER_FETCH_CONCURRENCY)
    await asyncio.gather(*(_fetch_member(slug, limit, rate_limited) for slug in slugs))
    await _apply_roster(guild, roster)
    return GuildRefreshOutcome(fetched=len(slugs), rate_limited=rate_limited.is_set())


async def _members_to_fetch(members: list[GuildRosterMember], budget: int, at: datetime) -> list[str]:
    """Slugs of the members not refreshed within ``GUILD_ROSTER_STALE_AFTER``, at most ``budget``."""
    async with unit_of_work() as db:
        recent = await character_repo.checked_since(
            db, [m.blizzard_character_id for m in members], at - GUILD_ROSTER_STALE_AFTER,
        )
    stale = [m.slug for m in members if m.slug is not None and m.blizzard_character_id not in recent]
    return stale[:budget]


async def _fetch_member(slug: str, limit: asyncio.Semaphore, rate_limited: asyncio.Event) -> None:
    async with limit:
        if rate_limited.is_set():
            return
        try:
            await character_lookup_service.get_character(slug, viewed=False)
        except CharacterLookupError as exc:
            # Already recorded on the character by the look-up; the roster goes on.
            if exc.status_code == httpx.codes.TOO_MANY_REQUESTS:
                rate_limited.set()
            logger.warning("Guild member %s not refreshed: %s", slug, exc.summary())
        except Exception:
            # A bug reading one member's answer must not cost the guild its roster.
            logger.exception("Guild member %s not refreshed", slug)


async def _not_found(guild: WowGuild) -> None:
    if guild.last_error != GUILD_NOT_FOUND_ERROR:
        # Blizzard 404s now and then on things that exist: wait for a second one.
        await _record_error(guild, GUILD_NOT_FOUND_ERROR)
        return
    async with unit_of_work() as db:
        await guild_repo.mark_gone(db, guild.id, _now())
    logger.info("Guild %s is gone: Blizzard has no guild by that name", guild.slug)


async def _record_error(guild: WowGuild, message: str) -> None:
    async with unit_of_work() as db:
        await guild_repo.record_error(db, guild.id, message[:CHARACTER_ERROR_MAX_LENGTH], _now())
    logger.warning("Guild %s roster not refreshed: %s", guild.slug, message)


async def _apply_roster(guild: WowGuild, roster: GuildRoster) -> None:
    at = _now()
    async with unit_of_work() as db:
        await guild_repo.record_roster(db, guild.id, roster.listed, at)
        await character_repo.apply_roster(db, guild.id, {m.blizzard_character_id: m.rank for m in roster.members})
