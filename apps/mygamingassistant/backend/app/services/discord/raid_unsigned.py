"""Raid: Unsigned's background work — reading the member list, then who hasn't signed up.

The handlers (``components.raid_unsigned``) answer at once (deferred, or
"Checking…" in place) and schedule these, which run after the response like
the rest of the bot's background work (``raid_publisher``): their own
transactions, every REST call bounded, never raising.  Each ends by editing
the card the interaction came from (``edit_original``).

* :func:`show_list` — the raid's roles, the server's members holding them,
  and who of those has no sign-up, by the class they last signed up as.
* :func:`send_ping` — reads the list again and pings whoever still hasn't
  signed up, through ``raid_ping`` on the raid's Unsigned slot.  When nobody
  (or too many) is left, the raid can't take a ping any more, or the list
  can't be read, the slot is handed back and the card says why.  A crash
  keeps the slot (a message may have gone out), as ``raid_ping`` does.
* :func:`show_raiders` — the server's raider roles, as far as it still has them.

Members are read from Discord on every look (``raid_member_list``); nothing
about them is stored.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from platform_shared.services.discord import DiscordApiError, DiscordRestClient

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo, wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_ping, raid_unsigned_copy, rest
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_context import utcnow
from app.services.discord.raid_member_list import MemberListError, fetch_members
from app.services.discord.raid_notifications import build_ping
from app.services.discord.raid_publisher import edit_original
from app.services.discord.raid_unsigned_views import error_data, no_pool_data, raiders_data, unsigned_data
from app.services.wow import raid_unsigned_service
from app.services.wow.raid_unsigned import Member, Pool, by_class, expected, known_pool, ping_block, pool_for, unsigned

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ListJob:
    """Show who hasn't signed up on the card the interaction came from."""

    event_id: uuid.UUID
    application_id: str
    token: str
    admin: bool  # the viewer has Manage Server: the no-roles card says where the default is set
    notice: str | None = None  # above the list, e.g. what the role menu just saved


@dataclass(frozen=True)
class UnsignedPingJob:
    """A [Ping them] the leader sent, captured inside the submit's transaction."""

    event_id: uuid.UUID
    channel_id: str
    text: str
    signature: str  # ``raid_copy.ping_signature``
    application_id: str
    token: str
    claimed_at: datetime  # ``raid_unsigned_service.claim_ping``'s slot


@dataclass(frozen=True)
class RaidersJob:
    """Show the server's raider roles on the card the interaction came from."""

    guild_discord_id: str
    application_id: str
    token: str
    notice: str | None = None


@dataclass(frozen=True)
class _Checked:
    """Who should sign up for a raid and who of them hasn't."""

    event: WowRaidEvent
    pool: Pool
    expected_count: int
    unsigned: list[Member]
    classes: dict[str, str]  # user id → the class they last signed up as
    truncated: bool
    gone: str | None  # ``ROLES_GONE`` when a role the raid checked was deleted


async def show_list(job: ListJob) -> None:
    """Edit the card into who hasn't signed up, or why that can't show."""
    try:
        async with rest.make_rest_client() as client:
            data = await _check(client, job.event_id, admin=job.admin, notice=job.notice)
            if isinstance(data, _Checked):
                data = _list_data(data, notice=job.notice)
            await edit_original(client, job.application_id, job.token, data)
    except Exception:
        logger.exception("Raid bot: show_list failed for event %s", job.event_id)
        await _report(job.application_id, job.token, raid_copy.GENERIC_ERROR)


async def send_ping(job: UnsignedPingJob) -> None:
    """Ping whoever still hasn't signed up; else hand the slot back and show the list saying why not."""
    try:
        async with rest.make_rest_client() as client:
            checked = await _check(client, job.event_id, admin=False, notice=None)
            if not isinstance(checked, _Checked):
                await _release_slot(job)
                await edit_original(client, job.application_id, job.token, checked)
                return
            block = ping_block(checked.event, utcnow(), len(checked.unsigned))
            if block is not None:
                await _release_slot(job)
                data = _list_data(checked, notice=raid_unsigned_copy.ping_refused(block))
                await edit_original(client, job.application_id, job.token, data)
                return
            await raid_ping.deliver(client, _ping_job(job, checked))
    except Exception:
        logger.exception("Raid bot: Unsigned send_ping failed for event %s", job.event_id)
        await _report(job.application_id, job.token, raid_copy.ping_unconfirmed(job.channel_id))


async def show_raiders(job: RaidersJob) -> None:
    """Edit the card into the server's raider roles menu."""
    try:
        async with rest.make_rest_client() as client:
            await edit_original(client, job.application_id, job.token, await _raiders_card(client, job))
    except Exception:
        logger.exception("Raid bot: show_raiders failed for guild %s", job.guild_discord_id)
        await _report(job.application_id, job.token, raid_copy.GENERIC_ERROR)


async def _check(
    client: DiscordRestClient, event_id: uuid.UUID, *, admin: bool, notice: str | None
) -> _Checked | dict[str, Any]:
    """Who should sign up for the raid and who hasn't; else the card saying why that can't show."""
    async with unit_of_work() as db:
        found = await _load(db, event_id)
    if found is None:
        return ephemeral_data(raid_copy.NOT_FOUND, components=[], embeds=[])
    event, guild = found
    pool = pool_for(event, guild)
    if not pool.role_ids:
        return no_pool_data(event, admin=admin, notice=notice)
    try:
        members = await fetch_members(client, guild.discord_guild_id)
        pool, dropped = known_pool(pool, await _server_role_ids(client, guild.discord_guild_id))
    except MemberListError as exc:
        return error_data(event, _joined(notice, _error_text(exc)))
    gone = None
    if dropped:
        gone = raid_unsigned_copy.ROLES_GONE
    if not pool.role_ids:
        return no_pool_data(event, admin=admin, notice=_joined(notice, gone))
    wanted = expected(members.members, pool)
    async with unit_of_work() as db:
        signed = {signup.discord_user_id for signup in await wow_raid_signup_repo.list_for_event(db, event.id)}
        left = unsigned(wanted, signed)
        classes = await raid_unsigned_service.classes_for(db, guild, [member.user_id for member in left])
    return _Checked(
        event=event,
        pool=pool,
        expected_count=len(wanted),
        unsigned=left,
        classes=classes,
        truncated=members.truncated,
        gone=gone,
    )


async def _load(db: Any, event_id: uuid.UUID) -> tuple[WowRaidEvent, WowRaidGuild] | None:
    event = await wow_raid_event_repo.get(db, event_id)
    if event is None:
        return None
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    if guild is None:
        return None
    return event, guild


def _list_data(checked: _Checked, *, notice: str | None) -> dict[str, Any]:
    return unsigned_data(
        checked.event,
        pool=checked.pool,
        expected_count=checked.expected_count,
        columns=by_class(checked.unsigned, checked.classes),
        truncated=checked.truncated,
        block=ping_block(checked.event, utcnow(), len(checked.unsigned)),
        emojis=emojis.current(),
        notice=_joined(notice, checked.gone),
    )


async def _server_role_ids(client: DiscordRestClient, guild_discord_id: str) -> set[str]:
    """The ids of the roles the server has now; raises :class:`MemberListError` like the member list."""
    try:
        roles = await rest.bounded(client.get_guild_roles(guild_discord_id))
    except DiscordApiError as exc:
        logger.warning(
            "Raid bot: Discord refused the roles of guild %s (status %s, code %s)",
            guild_discord_id,
            exc.status,
            exc.code,
        )
        raise MemberListError(exc.status, exc.code) from exc
    except (TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: the roles of guild %s got no answer (%s)", guild_discord_id, type(exc).__name__)
        raise MemberListError(unanswered=True) from exc
    return {str(role["id"]) for role in roles if isinstance(role, dict) and "id" in role}


def _error_text(exc: MemberListError) -> str:
    if exc.intent_off:
        return raid_unsigned_copy.INTENT_OFF
    if exc.unanswered:
        return raid_unsigned_copy.NO_ANSWER
    return raid_unsigned_copy.fetch_failed(exc.code, exc.status)


def _joined(*lines: str | None) -> str | None:
    """The lines given, one per line; None when there are none."""
    return "\n".join(line for line in lines if line) or None


def _ping_job(job: UnsignedPingJob, checked: _Checked) -> raid_ping.PingJob:
    user_ids = [member.user_id for member in checked.unsigned]
    return raid_ping.PingJob(
        event_id=job.event_id,
        channel_id=checked.event.channel_id,
        post_id=checked.event.message_id,
        messages=build_ping(job.text, job.signature, user_ids),
        application_id=job.application_id,
        token=job.token,
        claimed_at=job.claimed_at,
        slot="unsigned",
    )


async def _release_slot(job: UnsignedPingJob) -> None:
    """Nobody was pinged: hand the Unsigned slot back so the leader can try again at once."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, job.event_id)
        if event is not None:
            await raid_unsigned_service.release_ping(db, event, claimed_at=job.claimed_at)


async def _raiders_card(client: DiscordRestClient, job: RaidersJob) -> dict[str, Any]:
    async with unit_of_work() as db:
        guild = await wow_raid_guild_repo.get_by_discord_id(db, job.guild_discord_id)
    saved: list[str] = []
    if guild is not None and guild.raider_role_ids:
        saved = [str(role_id) for role_id in guild.raider_role_ids]
    try:
        known = await _server_role_ids(client, job.guild_discord_id)
    except MemberListError:
        # A deleted role can't sit in the menu, and which are deleted is unknown.
        text = _joined(job.notice, raid_unsigned_copy.RAIDERS_NO_ANSWER) or ""
        return ephemeral_data(text, components=[], embeds=[])
    return raiders_data([role_id for role_id in saved if role_id in known], notice=job.notice)


async def _report(application_id: str, token: str, text: str) -> None:
    """After a crash, best effort: don't leave the card on "Checking…"."""
    try:
        async with rest.make_rest_client() as client:
            await edit_original(client, application_id, token, ephemeral_data(text, components=[], embeds=[]))
    except Exception:
        logger.exception("Raid bot: could not report an Unsigned outcome")
