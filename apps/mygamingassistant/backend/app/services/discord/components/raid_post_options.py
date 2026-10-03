"""Raid: Edit → Advanced → Pin the post, Voice channel and Delete the post; /raid-admin advanced's pin and voice.

``components.raid_advanced`` routes here with the raid already loaded under
its row lock (or the server's card already checked for Manage Events).
Every answer replaces the card (type 7).

* **Pin the post** — saved.  On a posted raid whose pin has to change, the
  card comes back busy (every button off) and :func:`update_pin_card` pins
  or unpins in the background (``raid_pin.sync``), then edits the card with
  how it went (``GONE`` when the raid has moved on meanwhile).
* **Voice channel** — saved; a posted raid's post is re-rendered in the
  background (its "Voice:" line).
* **Delete the post** — saved; the worker deletes the post that long after
  the raid (``raid_sweeps``).
* The server's pin and voice channel re-render, in the background, the
  posts of the open raids that follow them
  (``raid_advanced_publish.refresh_following``) — and so pin or unpin them.

A channel the menu never offers (an old card) is ``raid_copy.GENERIC_ERROR``.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord import (
    raid_advanced_copy,
    raid_advanced_publish,
    raid_copy,
    raid_extras_copy,
    raid_pin,
    raid_post_options_copy,
    raid_publisher,
    rest,
)
from app.services.discord.interaction import Interaction, ephemeral_data, update_response, update_text_response
from app.services.discord.raid_advanced_views import (
    advanced_card,
    pin_card,
    server_pin_card,
    server_voice_card,
    voice_card,
)
from app.services.discord.raid_context import RaidContext
from app.services.wow import raid_advanced, raid_advanced_service
from app.services.wow.raid_advanced import NO_VOICE, PinResult, delete_choice, voice_choice

logger = logging.getLogger(__name__)

# The raids whose settings can change: a draft, or a raid still to come.
_OPEN: Final = ("draft", "scheduled")
# Pin the post's buttons → the raid's own choice (``inherit``: the server's).
_PIN: Final[dict[str, bool | None]] = {"on": True, "off": False, "inherit": None}


async def set_pin(
    db: AsyncSession, found: RaidContext, verb: str, interaction: Interaction, background: BackgroundTasks
) -> dict[str, Any]:
    """[Pin it], [Don't pin], the server's default: saved; a posted raid whose pin must change gets the busy card."""
    value = _PIN[verb]
    event, guild = found.event, found.guild
    await raid_advanced_service.set_pin(db, event, value)
    if event.message_id is None or raid_advanced.pin_step(event, guild) is None:
        return update_response(pin_card(event, guild, notice=_pin_saved(value)))
    notice = raid_post_options_copy.busy(raid_advanced.pin_wanted(event, guild))
    background.add_task(update_pin_card, event.id, interaction.application_id, interaction.token)
    return update_response(pin_card(event, guild, notice=notice, busy=True))


async def update_pin_card(event_id: uuid.UUID, application_id: str, token: str) -> None:
    """The background half of a Pin the post button: the pin, then the card saying how it went.  Never raises."""
    try:
        async with rest.make_rest_client() as client:
            result = await raid_pin.sync(client, event_id)
            async with unit_of_work() as db:
                data = await _pin_card_after(db, event_id, result)
            await raid_publisher.edit_original(client, application_id, token, data)
    except Exception:
        logger.exception("Raid bot: updating raid %s's Pin the post card failed", event_id)


async def _pin_card_after(db: AsyncSession, event_id: uuid.UUID, result: PinResult | None) -> dict[str, Any]:
    """The card as the raid is now: what's saved, or why the pin didn't go through; ``GONE`` once it's moved on."""
    event = await wow_raid_event_repo.get(db, event_id)
    if event is None or event.status not in _OPEN:
        return ephemeral_data(raid_extras_copy.GONE, embeds=[])
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    if guild is None:
        return ephemeral_data(raid_extras_copy.GONE, embeds=[])
    notice = raid_post_options_copy.pin_problem(result) or _pin_saved(event.pin_post)
    return pin_card(event, guild, notice=notice)


def _pin_saved(value: bool | None) -> str:
    if value is None:
        return raid_advanced_copy.INHERIT_NOTICE
    return raid_post_options_copy.pin_saved(value, server=False)


async def set_voice(
    db: AsyncSession, found: RaidContext, verb: str, interaction: Interaction, background: BackgroundTasks
) -> dict[str, Any]:
    """The voice card's menu, [No voice channel] and [Use server default]: saved, then the post re-rendered."""
    event, guild = found.event, found.guild
    channel_id: str | None = None
    notice = raid_advanced_copy.INHERIT_NOTICE
    if verb == "voice":
        channel_id = voice_choice(interaction.values)
        if channel_id is None:
            return update_text_response(raid_copy.GENERIC_ERROR)
        notice = raid_post_options_copy.voice_saved(channel_id, server=False)
    if verb == "off":
        channel_id = NO_VOICE
        notice = raid_post_options_copy.voice_saved(None, server=False)
    await raid_advanced_service.set_voice(db, event, channel_id)
    if event.status == "scheduled":
        background.add_task(raid_publisher.refresh_public_message, event.id)
    return update_response(voice_card(event, guild, notice=notice))


async def set_delete(db: AsyncSession, found: RaidContext, value: str) -> dict[str, Any]:
    """The Delete the post menu: hours after the raid, or ``keep``; the Advanced card again, saying so."""
    choice = delete_choice(value)
    if choice is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    hours = None
    if isinstance(choice, int):
        hours = choice
    await raid_advanced_service.set_delete_after(db, found.event, hours)
    notice = raid_post_options_copy.delete_saved(hours)
    return update_response(advanced_card(found.event, found.guild, notice=notice))


async def set_server_pin(
    db: AsyncSession, guild: WowRaidGuild, verb: str, background: BackgroundTasks
) -> dict[str, Any]:
    """The server's [Pin raid posts] / [Don't pin]: saved, then the posts that follow it pinned or unpinned."""
    value = verb == "on"
    await raid_advanced_service.set_server_pin(db, guild, value)
    background.add_task(raid_advanced_publish.refresh_following, guild.id, "pin_post")
    return update_response(server_pin_card(guild, notice=raid_post_options_copy.pin_saved(value, server=True)))


async def set_server_voice(
    db: AsyncSession, guild: WowRaidGuild, verb: str, interaction: Interaction, background: BackgroundTasks
) -> dict[str, Any]:
    """The server's voice menu and [No voice channel]: saved, then the posts that follow it re-rendered."""
    channel_id = None
    if verb == "voice":
        channel_id = voice_choice(interaction.values)
        if channel_id is None:
            return update_text_response(raid_copy.GENERIC_ERROR)
    await raid_advanced_service.set_server_voice(db, guild, channel_id)
    background.add_task(raid_advanced_publish.refresh_following, guild.id, "voice_channel_id")
    notice = raid_post_options_copy.voice_saved(channel_id, server=True)
    return update_response(server_voice_card(guild, notice=notice))
