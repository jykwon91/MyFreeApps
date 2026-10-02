"""Organiser buttons on private messages — create preview and cancel confirmation.

[Post raid] / [Cancel] (preview) and [Cancel raid] / [Keep raid] (cancel
confirmation).  Each re-checks Manage Events server-side — the buttons live
on an ephemeral only the organiser saw, but custom_ids are client-supplied.

Posting design: [Post raid] flips the draft to ``scheduled`` (row-locked,
idempotent) and schedules notifications inside the request, answers
UPDATE_MESSAGE "Posting your raid in #raids…" immediately, and posts the
public message in a background task that then edits this private message
to "Posted … [Jump to the raid]" — or back to the preview with the reason
if Discord refused.  The public post never blocks the 3-second budget.
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_EVENTS

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo
from app.services.discord import emojis, raid_copy, raid_publisher
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import load_configured_guild, load_event, utcnow
from app.services.discord.raid_views import preview_data
from app.services.wow import raid_event_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_time_parser import PAST_MESSAGE


def _forbidden() -> dict[str, Any]:
    return ephemeral_response(raid_copy.NOT_PERMITTED_EVENTS)


async def handle_confirm(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return _forbidden()
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        event = await wow_raid_event_repo.get_for_update(db, parsed.event_id)
        if guild is None or event is None or event.guild_id != guild.id:
            return update_text_response(raid_copy.NOT_FOUND)
        outcome = await raid_event_service.mark_posting(db, event=event, guild=guild, now=utcnow())
        if outcome == "already_posted":
            link = raid_publisher.event_link(guild.discord_guild_id, event)
            return update_text_response(raid_copy.already_posted(link))
        if outcome == "gone":
            return update_text_response(raid_copy.NOT_FOUND)
        if outcome == "in_past":
            return update_response(preview_data(event, guild, emojis=emojis.current(), notice=PAST_MESSAGE))
        channel_id = event.channel_id

    background.add_task(raid_publisher.post_raid, parsed.event_id, interaction.application_id, interaction.token)
    return update_text_response(raid_copy.posting(channel_id))


async def handle_discard(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return _forbidden()
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=True, statuses=("draft", "scheduled"))
        if context is None:
            return update_text_response(raid_copy.DRAFT_DISCARDED)
        if not await raid_event_service.discard_draft(db, context.event):
            link = raid_publisher.event_link(context.guild.discord_guild_id, context.event)
            return update_text_response(raid_copy.already_posted(link))
    return update_text_response(raid_copy.DRAFT_DISCARDED)


async def handle_cancel(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return _forbidden()
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=True, statuses=("scheduled", "cancelled"))
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.status == "cancelled":
            return update_text_response(raid_copy.ALREADY_CANCELLED)
        dm_ids = await raid_event_service.cancel_event(db, event=context.event, guild=context.guild)
        channel_id = context.event.channel_id

    background.add_task(raid_publisher.announce_cancellation, parsed.event_id, dm_ids)
    return update_text_response(raid_copy.cancelled_done(channel_id))


async def handle_keep(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return _forbidden()
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=True)
        if context is not None:
            # Drop the staged reason so a later cancel doesn't reuse it silently.
            await raid_event_service.set_cancel_reason(db, context.event, None)
    return update_text_response(raid_copy.CANCEL_KEPT)
