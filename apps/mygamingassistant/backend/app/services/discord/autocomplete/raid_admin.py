"""Autocomplete for /raid-admin options.

* ``timezone`` (setup) — IANA zones + friendly aliases, no DB.
* ``event`` (edit / cancel / signup) — this guild's upcoming scheduled raids,
  labelled "Sat Oct 10 8pm Onyxia"; the value is the event UUID.  For
  ``signup``, raids that have started too, until they're finished.  For
  ``export``, the latest raids on or finished, newest first.

Autocomplete can't show errors, so every failure path returns no choices.
"""
from __future__ import annotations

from typing import Any, Final

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo
from app.services.discord.interaction import Interaction, autocomplete_response
from app.services.discord.raid_context import load_configured_guild, utcnow
from app.services.discord.raid_views import event_choice_label
from app.services.wow import raid_timezones

MAX_CHOICES: Final = 25


async def handle_raid_admin_autocomplete(interaction: Interaction) -> dict[str, Any]:
    focused = interaction.focused_option
    query = str(interaction.options.get(focused) or "")
    if focused == "timezone":
        return autocomplete_response(raid_timezones.search(query))
    if focused == "event":
        return autocomplete_response(await _event_choices(interaction, query))
    return autocomplete_response([])


async def _event_choices(interaction: Interaction, query: str) -> list[dict[str, Any]]:
    needle = query.strip().lower()
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return []
        if interaction.subcommand == "export":
            events = await wow_raid_event_repo.list_recent(db, guild.id, limit=MAX_CHOICES)
        else:
            after = utcnow()
            if interaction.subcommand == "signup":
                after = None
            events = await wow_raid_event_repo.list_upcoming(db, guild.id, after=after, limit=MAX_CHOICES)
        choices = []
        for event in events:
            label = event_choice_label(event, guild.timezone)
            if needle and needle not in label.lower():
                continue
            choices.append({"name": label, "value": str(event.id)})
        return choices
