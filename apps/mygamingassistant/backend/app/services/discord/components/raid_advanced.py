"""Raid: Edit / More options → [Advanced], and /raid-admin advanced — the handlers.

**A raid's card** (``raid:v1:adv:…``): its leader, or anyone with Manage
Events (``load_led_event``), on a draft or a raid still to come.  Every
answer replaces the card (type 7), apart from the Minimum form (type 9).

* A write holds the raid's row lock.  A Ready check pick moves the raid's
  pending ready-check row in the same transaction.
* A change to who can sign up re-renders a posted raid's post in the
  background (its "Open to" line).
* Pin the post, Voice channel and Delete the post are
  ``components.raid_post_options``'s.

**The server's card** (``raid:v1:sadv:…``, from ``/raid-admin advanced``):
Manage Events, checked again on every tap.  A change to the server's allowed
roles re-renders, in the background, the posts of the open raids that follow
it (``raid_advanced_publish``); the banned roles aren't on any post.  Its pin
and voice channel are ``components.raid_post_options``'s.

A menu value the cards never offer (an old card) is ``raid_copy.GENERIC_ERROR``.
"""
from __future__ import annotations

from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_advanced_copy, raid_advanced_publish, raid_copy, raid_publisher
from app.services.discord.components import raid_post_options
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_advanced_views import (
    advanced_card,
    delete_card,
    minimum_modal,
    pin_card,
    ready_card,
    server_card,
    server_pin_card,
    server_ready_card,
    server_voice_card,
    server_who_card,
    voice_card,
    who_card,
)
from app.services.discord.raid_context import RaidContext, load_configured_guild, load_led_event, utcnow
from app.services.discord.raid_forms import FIELD
from app.services.wow import raid_advanced_service
from app.services.wow.raid_advanced import RoleList, ready_choice
from app.services.wow.raid_custom_id import RaidCustomId

# The raids whose settings can change: a draft, or a raid still to come.
_OPEN: Final = ("draft", "scheduled")
# The verbs that write, under the raid's row lock.
_WRITES: Final = ("allow", "ban", "all", "inherit", "ready", "on", "off", "voice", "del")
# A role menu's verb → the list it sets.
_WHICH: Final[dict[str, RoleList]] = {"allow": "signup", "ban": "banned"}


async def handle_advanced(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """[Advanced] and the card's menu, then its sub-cards' menus and buttons."""
    assert parsed.event_id is not None
    verb, arg = parsed.args[0], parsed.args[1]
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=verb in _WRITES, statuses=_OPEN)
        if isinstance(found, str):
            return update_text_response(found)
        if verb == "open":
            return update_response(advanced_card(found.event, found.guild))
        if verb == "pick":
            return _picked(found, _value(interaction))
        if verb == "ready":
            return await _set_ready(db, found, _value(interaction))
        if verb == "del":
            return await raid_post_options.set_delete(db, found, _value(interaction))
        if arg == "pin":
            return await raid_post_options.set_pin(db, found, verb, interaction, background)
        if "voice" in (verb, arg):
            return await raid_post_options.set_voice(db, found, verb, interaction, background)
        notice, changed = await _set_who(db, found, interaction, verb)
        card = who_card(found.event, found.guild, notice=notice)
        posted = found.event.status == "scheduled"
    if changed and posted:
        background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    return update_response(card)


async def handle_minimum_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The Minimum sign-ups form: saved under the raid's row lock, then the card saying what it did."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_OPEN)
        if isinstance(found, str):
            return update_text_response(found)
        saved = await raid_advanced_service.set_minimum(db, found.event, interaction.fields.get(FIELD, ""))
        notice = raid_advanced_copy.minimum_notice(saved, found.event)
        return update_response(advanced_card(found.event, found.guild, notice=notice))


async def handle_server(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """/raid-admin advanced's card: its menu, then its sub-cards' menus and buttons."""
    if not interaction.has_permission(MANAGE_EVENTS):
        return update_text_response(raid_copy.NOT_PERMITTED_EVENTS)
    verb, arg = parsed.args[0], parsed.args[1]
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return update_text_response(raid_copy.NOT_CONFIGURED)
        if verb == "open":
            return update_response(server_card(guild))
        if verb == "pick":
            return _server_picked(guild, _value(interaction))
        if verb == "ready":
            return await _set_server_ready(db, guild, _value(interaction))
        if arg == "pin":
            return await raid_post_options.set_server_pin(db, guild, verb, background)
        if "voice" in (verb, arg):
            return await raid_post_options.set_server_voice(db, guild, verb, interaction, background)
        which = _WHICH[verb]
        saved = await raid_advanced_service.set_server_roles(db, guild, which, interaction.values)
        card = server_who_card(guild, notice=raid_advanced_copy.roles_notice(which, saved, server=True))
        guild_id = guild.id
    if saved.saved and which == "signup":
        background.add_task(raid_advanced_publish.refresh_following, guild_id, "signup_role_ids")
    return update_response(card)


async def open_advanced(interaction: Interaction) -> dict[str, Any]:
    """``/raid-admin advanced`` (Manage Events, checked by the command): the server's defaults."""
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        return message_response(server_card(guild))


def _picked(found: RaidContext, key: str) -> dict[str, Any]:
    """The card's menu: the Minimum form, or a setting's card."""
    if key == "min":
        return minimum_modal(found.event)
    if key == "who":
        return update_response(who_card(found.event, found.guild))
    if key == "ready":
        return update_response(ready_card(found.event, found.guild))
    if key == "pin":
        return update_response(pin_card(found.event, found.guild))
    if key == "voice":
        return update_response(voice_card(found.event, found.guild))
    if key == "del":
        return update_response(delete_card(found.event, found.guild))
    return update_text_response(raid_copy.GENERIC_ERROR)


async def _set_ready(db: AsyncSession, found: RaidContext, value: str) -> dict[str, Any]:
    """The Ready check menu: the raid's own time, or the server's (``inherit``); the card again, saying so."""
    choice = ready_choice(value, raid=True)
    if choice is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    minutes = None
    if isinstance(choice, int):
        minutes = choice
    await raid_advanced_service.set_ready_check(db, found.event, found.guild, minutes, utcnow())
    notice = raid_advanced_copy.ready_notice(found.event, found.guild)
    return update_response(advanced_card(found.event, found.guild, notice=notice))


async def _set_who(db: AsyncSession, found: RaidContext, interaction: Interaction, verb: str) -> tuple[str, bool]:
    """The who card's role menus and buttons: (what the card says, whether anything was saved)."""
    if verb == "all":
        await raid_advanced_service.open_to_everyone(db, found.event)
        return raid_advanced_copy.EVERYONE_NOTICE, True
    if verb == "inherit":
        await raid_advanced_service.follow_server_roles(db, found.event)
        return raid_advanced_copy.INHERIT_NOTICE, True
    which = _WHICH[verb]
    saved = await raid_advanced_service.set_roles(
        db, found.event, which, interaction.values, guild_discord_id=found.guild.discord_guild_id
    )
    return raid_advanced_copy.roles_notice(which, saved, server=False), saved.saved


def _server_picked(guild: WowRaidGuild, key: str) -> dict[str, Any]:
    """/raid-admin advanced's menu: a setting's card."""
    if key == "who":
        return update_response(server_who_card(guild))
    if key == "ready":
        return update_response(server_ready_card(guild))
    if key == "pin":
        return update_response(server_pin_card(guild))
    if key == "voice":
        return update_response(server_voice_card(guild))
    return update_text_response(raid_copy.GENERIC_ERROR)


async def _set_server_ready(db: AsyncSession, guild: WowRaidGuild, value: str) -> dict[str, Any]:
    """The server's Ready check menu: saved for raids posted from now on, then the server's card."""
    minutes = ready_choice(value, raid=False)
    if not isinstance(minutes, int):
        return update_text_response(raid_copy.GENERIC_ERROR)
    await raid_advanced_service.set_server_ready_check(db, guild, minutes)
    return update_response(server_card(guild, notice=raid_advanced_copy.server_ready_notice(minutes)))


def _value(interaction: Interaction) -> str:
    return next(iter(interaction.values), "")
