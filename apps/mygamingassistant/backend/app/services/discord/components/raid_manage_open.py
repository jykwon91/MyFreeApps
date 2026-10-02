"""Manage sign-ups — two more doors onto a player's card.

* **Raid: Manage** — right-click a member → Apps.  The card for the one
  raid the member using it leads; with several, the raid picker first.
* ``/raid-admin signup event:<raid> player:<member>`` — the card for that
  raid straight away.

Both answer with the same card as the hub's player menu, so every tap
after is a Manage sign-ups verb.  Neither writes anything, sends a DM or
takes a lock.  Commands default to Manage Events (client-side, advisory),
so each raid is re-checked with ``may_lead``: a raid's own leader gets in
without the permission.
"""
from __future__ import annotations

from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo, wow_raid_signup_repo
from app.services.discord import raid_copy
from app.services.discord.components.raid_manage_common import card_for, known, load, one_value, target_of
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import RaidContext, load_configured_guild, may_lead, parse_event_id
from app.services.discord.raid_manage_pick_views import PICK_RAIDS, raid_pick_data
from app.services.discord.raid_manage_views import Target
from app.services.wow.raid_custom_id import RaidCustomId, is_member_id

# How many scheduled raids a right-click looks through for the ones its member leads.
_SCHEDULED: Final = 100


async def handle_manage_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    """Raid: Manage on a member: their card on the raid the member using it leads, or the raid picker."""
    if interaction.guild_id is None:
        return ephemeral_response(raid_copy.GUILD_ONLY)
    refusal = _refusal(interaction, interaction.target_id)
    if refusal is not None:
        return ephemeral_response(refusal)
    target = _resolved(interaction, interaction.target_id)
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        # Raids that have started stay until they're finished: a no-show can still go to the bench.
        scheduled = await wow_raid_event_repo.list_upcoming(db, guild.id, after=None, limit=_SCHEDULED)
        if not scheduled:
            return ephemeral_response(raid_copy.NO_UPCOMING)
        led = [event for event in scheduled if may_lead(interaction, event)]
        if not led:
            return ephemeral_response(raid_copy.NOT_LEADER)
        if len(led) == 1:
            return await _card(db, interaction, RaidContext(guild, led[0]), target)
        shown = led[:PICK_RAIDS]
        signups = await wow_raid_signup_repo.list_for_events(db, [event.id for event in shown])
        return message_response(raid_pick_data(target, shown, signups, guild.timezone))


async def open_from_command(interaction: Interaction) -> dict[str, Any]:
    """``/raid-admin signup``: the player's card on the raid picked."""
    event_id = parse_event_id(interaction.str_option("event"))
    if event_id is None:
        return ephemeral_response(raid_copy.NOT_FOUND)
    member = interaction.str_option("player") or ""
    refusal = _refusal(interaction, member)
    if refusal is not None:
        return ephemeral_response(refusal)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return ephemeral_response(found)
        return await _card(db, interaction, found, _resolved(interaction, member))


async def handle_raid_pick(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """A raid picked in the picker: the player's card on it, in place of the picker."""
    raid, _, member = one_value(interaction).partition(":")
    event_id = parse_event_id(raid)
    if event_id is None or not is_member_id(member):
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        return update_response(await card_for(db, found, interaction, target, signups))


def _refusal(interaction: Interaction, member: str) -> str | None:
    """Why *member* can't be managed: not a member's id, or a bot."""
    if not is_member_id(member):
        return raid_copy.GENERIC_ERROR
    if interaction.resolved_is_bot(member):
        return raid_copy.LEADER_BOT
    return None


def _resolved(interaction: Interaction, member: str) -> Target:
    """The player as Discord resolved them: their server name and avatar."""
    return Target(member, known(interaction.resolved_display_name(member)), interaction.resolved_avatar_url(member))


async def _card(db: AsyncSession, interaction: Interaction, found: RaidContext, target: Target) -> dict[str, Any]:
    signups = await wow_raid_signup_repo.list_for_event(db, found.event.id)
    return message_response(await card_for(db, found, interaction, target, signups))
