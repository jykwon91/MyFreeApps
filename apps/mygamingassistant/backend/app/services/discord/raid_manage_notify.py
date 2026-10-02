"""Background work for Manage sign-ups: the player's DM, and their name when a card didn't carry it.

Runs after the leader's card has answered, like :mod:`raid_publisher`:
each task opens its own short transaction, bounds every REST call and
never raises.  A DM that doesn't go out is reported to the leader in a
private follow-up, never over the card (they may be on another one by then).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

import httpx
from platform_shared.services.discord import DiscordApiError

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo, wow_raid_signup_repo
from app.services.discord import raid_manage_copy, raid_publisher, rest
from app.services.discord.interaction import UNKNOWN_PLAYER, member_display_name
from app.services.discord.raid_context import signup_refusal, utcnow
from app.services.discord.raid_views import unix
from app.services.wow.raid_text import title_text

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ManageDm:
    """A DM to a player a leader added or removed.

    *who* names the player to the leader if the DM can't go out; the
    leader's interaction token carries that follow-up.
    """

    event_id: uuid.UUID
    user_id: str
    leader_id: str
    who: str
    application_id: str
    token: str


@dataclass(frozen=True)
class _Raid:
    """*signups_open*: members can still change their own sign-up (the post's buttons work)."""

    title: str
    starts_unix: int
    link: str | None
    signups_open: bool


async def notify_added(dm: ManageDm, label: str, queue_position: int | None) -> None:
    """'<leader> added you to <raid> as <spec>': a seat, or their place in the queue."""
    try:
        raid = await _load_raid(dm.event_id)
        if raid is None:
            return
        content = raid_manage_copy.added_dm(
            dm.leader_id, raid.title, raid.starts_unix, label, queue_position, raid.link, signups_open=raid.signups_open
        )
        await _send(dm, content)
    except Exception:
        logger.exception("Raid bot: notify_added failed for event %s", dm.event_id)


async def notify_removed(dm: ManageDm) -> None:
    """'<leader> removed you from <raid>.'"""
    try:
        raid = await _load_raid(dm.event_id)
        if raid is None:
            return
        await _send(dm, raid_manage_copy.removed_dm(dm.leader_id, raid.title, raid.starts_unix))
    except Exception:
        logger.exception("Raid bot: notify_removed failed for event %s", dm.event_id)


async def fill_display_name(event_id: uuid.UUID, guild_discord_id: str, user_id: str) -> None:
    """Name a player a leader added while their card carried no name.

    Their row holds ``UNKNOWN_PLAYER`` until then; a name they gave the
    bot meanwhile (by tapping the post) is left alone.  Runs before the
    post is re-rendered, so the post shows the name.
    """
    try:
        async with rest.make_rest_client() as client:
            try:
                member = await rest.bounded(client.get_guild_member(guild_discord_id, user_id))
            except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
                logger.warning("Raid bot: couldn't look up an added player's name (%s)", type(exc).__name__)
                return
        name = member_display_name(member)
        if name == UNKNOWN_PLAYER:
            return
        async with unit_of_work() as db:
            signup = await wow_raid_signup_repo.get(db, event_id=event_id, discord_user_id=user_id)
            if signup is not None and signup.display_name == UNKNOWN_PLAYER:
                await wow_raid_signup_repo.set_display_name(db, signup, name)
    except Exception:
        logger.exception("Raid bot: fill_display_name failed for event %s", event_id)


async def _load_raid(event_id: uuid.UUID) -> _Raid | None:
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get(db, event_id)
        if event is None:
            return None
        guild = await wow_raid_guild_repo.get(db, event.guild_id)
        if guild is None:
            return None
        link = raid_publisher.event_link(guild.discord_guild_id, event)
        signups_open = signup_refusal(event, utcnow()) is None
        return _Raid(title=title_text(event), starts_unix=unix(event.starts_at), link=link, signups_open=signups_open)


async def _send(dm: ManageDm, content: str) -> None:
    async with rest.make_rest_client() as client:
        sent = await raid_publisher.send_dm(client, dm.user_id, content)
    if not sent:
        await raid_publisher.send_ephemeral_followup(
            dm.application_id, dm.token, raid_manage_copy.dm_failed(dm.who)
        )
