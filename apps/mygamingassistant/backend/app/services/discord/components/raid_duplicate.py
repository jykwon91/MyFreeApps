"""Raid: Edit → [Copy raid] — a new raid with this one's settings.

[Copy raid] opens a form (type 9) for the copy's date and time, suggested a
week after the raid and rolled weekly into the future for an older one, as
Raid-Helper's ``/copy event`` moves it +7 days.  Its submit makes a **draft**
copy: the raid's settings (``wow_raid_event_repo.COPIED``), nobody signed
up, the copier as its creator.  It answers with the create preview (type 7),
so More options, [Post raid] and [Cancel] work as for ``/raid-admin create``.
A time that can't be read, or has passed, shows the edit card again saying
why.

Copying needs Manage Events, like [Post raid].  A raid that's cancelled or
finished can be copied too.
"""
from __future__ import annotations

from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_EVENTS

from app.db.session import unit_of_work
from app.services.discord import emojis, raid_repeat_copy
from app.services.discord.interaction import Interaction, ephemeral_response, update_response, update_text_response
from app.services.discord.raid_context import load_led_event, utcnow
from app.services.discord.raid_draft_views import preview_data
from app.services.discord.raid_edit_views import FIELD, edit_card
from app.services.discord.raid_repeat_views import copy_modal
from app.services.wow import raid_series_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_text import title_text
from app.services.wow.raid_time_parser import RaidTimeError, parse_raid_time

# What can be copied: a posted raid, on or over.
_COPYABLE: Final = ("scheduled", "cancelled", "completed")


async def handle_copy(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Copy raid]: the form for the copy's date and time."""
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_repeat_copy.NOT_PERMITTED_COPY)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=False, statuses=_COPYABLE)
        if isinstance(found, str):
            return update_text_response(found)
        return copy_modal(found.event, found.guild.timezone, now=utcnow())


async def handle_copy_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The form's submit: the draft copy on the create preview, else the edit card saying why not."""
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_repeat_copy.NOT_PERMITTED_COPY)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=False, statuses=_COPYABLE)
        if isinstance(found, str):
            return update_text_response(found)
        source, guild = found.event, found.guild
        try:
            starts_at = parse_raid_time(interaction.fields.get(FIELD, ""), tz_name=guild.timezone, now=utcnow())
        except RaidTimeError as exc:
            return update_response(edit_card(source, notice=exc.user_message))
        draft = await raid_series_service.copy_as_draft(
            db,
            source=source,
            guild=guild,
            starts_at=starts_at,
            user_id=interaction.user_id,
            display_name=interaction.display_name,
        )
        notice = raid_repeat_copy.copied(title_text(source))
        return update_response(preview_data(draft, guild, emojis=emojis.current(), notice=notice))
