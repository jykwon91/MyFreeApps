"""/raid — the member-facing command (everyone can use it).

Subcommands
-----------
  ping    health check; public "alive" message.
  list    up to 10 upcoming raids with links to their posts (private).
  prefs   remembered class + per-class spec and character name + DM reminders;
          with no options shows the current settings and a [Send me a test DM]
          button (private).

Organiser commands live under ``/raid-admin`` (see ``raid_admin.py``).
Each handler runs in one transaction and returns the interaction response.
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo, wow_raid_signup_repo
from app.services.discord import raid_copy, raid_member_copy
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    public_response,
)
from app.services.discord.raid_context import load_configured_guild, utcnow
from app.services.discord.raid_views import list_data, prefs_data
from app.services.wow import raid_member_prefs_service
from app.services.wow.raid_catalog import CLASSES_BY_KEY
from app.services.wow.raid_member_prefs_service import NamedCharacter

LIST_LIMIT = 10


async def handle_raid(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    """Dispatch /raid subcommands."""
    subcommand = interaction.subcommand
    if subcommand == "ping":
        return public_response("Raid bot is alive and ready!")
    if interaction.guild_id is None:
        return ephemeral_response(raid_copy.GUILD_ONLY)
    if subcommand == "list":
        return await _list(interaction)
    if subcommand == "prefs":
        return await _prefs(interaction)
    return ephemeral_response("Unknown command.")


async def _list(interaction: Interaction) -> dict[str, Any]:
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        events = await wow_raid_event_repo.list_upcoming(db, guild.id, after=utcnow(), limit=LIST_LIMIT)
        signups = await wow_raid_signup_repo.list_for_events(db, [event.id for event in events])
        return message_response(list_data(guild.discord_guild_id, events, signups))


async def _prefs(interaction: Interaction) -> dict[str, Any]:
    wow_class = interaction.str_option("class")
    spec = interaction.str_option("spec")
    character = interaction.str_option("character")
    dm_reminders = interaction.bool_option("dm_reminders")

    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        if wow_class is None and spec is None and character is None and dm_reminders is None:
            pref = await raid_member_prefs_service.get(db, guild=guild, discord_user_id=interaction.user_id)
            return message_response(prefs_data(pref))
        result = await raid_member_prefs_service.update_prefs(
            db,
            guild=guild,
            discord_user_id=interaction.user_id,
            wow_class=wow_class,
            spec=spec,
            dm_reminders=dm_reminders,
            character=character,
        )
        if result.error is not None:
            return ephemeral_response(result.error)
        return message_response(prefs_data(result.pref, heading=_saved(result.named)))


def _saved(named: NamedCharacter | None) -> str:
    """The heading over the saved settings: what ``character:`` did, when it was given."""
    if named is None:
        return "Saved."
    return raid_member_copy.prefs_named(named.name, CLASSES_BY_KEY[named.wow_class].label)
