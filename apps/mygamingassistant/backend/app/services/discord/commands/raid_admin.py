"""/raid-admin — organiser commands (setup, raiders, create, edit, cancel, signup,
repeats, attendance, export, advanced; attendance and export in
``raid_attendance.py``, raiders in ``components/raid_unsigned.py``, advanced in
``components/raid_advanced.py``).

A separate top-level command so ``default_member_permissions`` (Manage
Events) hides it from regular members' slash menu.  Discord only gates
per top-level command, and the client-side gate is advisory, so every
handler here also re-checks the member's permission bitfield from the
payload: Manage Events for everything but setup and raiders, which take Manage
Server.

Every reply is private (ephemeral).  Anything that must touch Discord's
REST API runs as a background task after the response (see
``raid_publisher``).
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_EVENTS, MANAGE_GUILD

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_guild_repo
from app.services.discord import emojis, raid_copy, raid_publisher, raid_setup_check
from app.services.discord.commands import raid_attendance
from app.services.discord.components.raid_advanced import open_advanced
from app.services.discord.components.raid_manage_open import open_from_command
from app.services.discord.components.raid_repeat import list_repeats
from app.services.discord.components.raid_unsigned import open_raiders
from app.services.discord.interaction import (
    Interaction,
    deferred_ephemeral_response,
    ephemeral_response,
    message_response,
)
from app.services.discord.raid_context import load_event, parse_event_id, utcnow
from app.services.discord.raid_draft_views import preview_data
from app.services.discord.raid_views import cancel_confirm_data
from app.services.wow import raid_event_service, raid_timezones
from app.services.wow.raid_catalog import RAIDS_BY_KEY
from app.services.wow.raid_time_parser import RaidTimeError, parse_raid_time

MIN_SIZE = 5  # matches commands_spec min_value; re-checked because Discord-side limits are advisory
MAX_SIZE = 40
MAX_NOTES = 200
MAX_REASON = 200


async def handle_raid_admin(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    if interaction.guild_id is None:
        return ephemeral_response(raid_copy.GUILD_ONLY)
    subcommand = interaction.subcommand
    if subcommand == "setup":
        return await _setup(interaction, background)
    if subcommand == "raiders":
        return await open_raiders(interaction, background)
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_copy.NOT_PERMITTED_EVENTS)
    if subcommand == "create":
        return await _create(interaction)
    if subcommand == "edit":
        return await _edit(interaction, background)
    if subcommand == "cancel":
        return await _cancel(interaction)
    if subcommand == "signup":
        return await open_from_command(interaction)
    if subcommand == "repeats":
        return await list_repeats(interaction)
    if subcommand == "attendance":
        return await raid_attendance.handle_admin(interaction)
    if subcommand == "export":
        return await raid_attendance.handle_export(interaction, background)
    if subcommand == "advanced":
        return await open_advanced(interaction)
    return ephemeral_response("Unknown command.")


def _clean_text(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()[:limit]
    return cleaned or None


async def _setup(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    if not interaction.has_permission(MANAGE_GUILD):
        return ephemeral_response(raid_copy.NOT_PERMITTED_GUILD)
    assert interaction.guild_id is not None
    channel_id = interaction.str_option("channel")
    tz_input = interaction.str_option("timezone") or ""
    if not channel_id:
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    tz_name = raid_timezones.resolve(tz_input)
    if tz_name is None:
        return ephemeral_response(raid_copy.unknown_timezone(tz_input))
    ping_role_id = interaction.str_option("ping_role")
    if ping_role_id == interaction.guild_id:
        return ephemeral_response(raid_copy.SETUP_NO_EVERYONE)  # @everyone's role id is the server's own
    role_mentionable = bool(interaction.resolved_role(ping_role_id or "").get("mentionable"))
    # Omitted = keep the server's default: turning these off by accident on a channel change would surprise people.
    discord_events, threads = interaction.bool_option("discord_events"), interaction.bool_option("threads")

    async with unit_of_work() as db:
        guild = await wow_raid_guild_repo.upsert_config(
            db,
            discord_guild_id=interaction.guild_id,
            raid_channel_id=channel_id,
            timezone=tz_name,
            configured_by_user_id=interaction.user_id,
            default_discord_event=discord_events,
            default_thread=threads,
        )
        # Setup states the complete config: no ping_role option = stop pinging.
        await wow_raid_guild_repo.set_ping_role(db, guild, ping_role_id)
        events_default, threads_default = guild.default_discord_event, guild.default_thread
        pin_posts = guild.pin_posts

    background.add_task(
        raid_setup_check.verify_setup,
        raid_setup_check.SetupCheck(
            application_id=interaction.application_id,
            token=interaction.token,
            guild_discord_id=interaction.guild_id,
            channel_id=channel_id,
            ping_role_id=ping_role_id,
            role_mentionable=role_mentionable,
            tz_name=tz_name,
            discord_events=events_default,
            threads=threads_default,
            extras_given=discord_events is not None or threads is not None,
            pin_posts=pin_posts,
        ),
    )
    return deferred_ephemeral_response()


async def _create(interaction: Interaction) -> dict[str, Any]:
    raid = RAIDS_BY_KEY.get(interaction.str_option("raid") or "")
    if raid is None:
        return ephemeral_response("Pick a raid from the list.")
    size = interaction.int_option("size")
    if size is None:
        size = raid.default_size
    if not MIN_SIZE <= size <= MAX_SIZE:
        return ephemeral_response(f"Raid size must be between {MIN_SIZE} and {MAX_SIZE}.")
    notes = _clean_text(interaction.str_option("notes"), MAX_NOTES)

    async with unit_of_work() as db:
        guild = await wow_raid_guild_repo.get_by_discord_id(db, interaction.guild_id or "")
        if guild is None or guild.raid_channel_id is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        try:
            starts_at = parse_raid_time(
                interaction.str_option("when") or "", tz_name=guild.timezone, now=utcnow()
            )
        except RaidTimeError as exc:
            return ephemeral_response(exc.user_message)
        event = await raid_event_service.create_draft(
            db,
            guild=guild,
            raid_key=raid.key,
            starts_at=starts_at,
            size_cap=size,
            notes=notes,
            created_by_user_id=interaction.user_id,
            created_by_display_name=interaction.display_name,
        )
        return message_response(preview_data(event, guild, emojis=emojis.current()))


async def _edit(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    event_id = parse_event_id(interaction.str_option("event"))
    when = interaction.str_option("when")
    size = interaction.int_option("size")
    notes = _clean_text(interaction.str_option("notes"), MAX_NOTES)
    if when is None and size is None and notes is None:
        return ephemeral_response(raid_copy.EDIT_NEEDS_A_CHANGE)
    if size is not None and not MIN_SIZE <= size <= MAX_SIZE:
        return ephemeral_response(f"Raid size must be between {MIN_SIZE} and {MAX_SIZE}.")
    if event_id is None:
        return ephemeral_response(raid_copy.NOT_FOUND)

    async with unit_of_work() as db:
        context = await load_event(db, interaction, event_id, lock=True)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        now = utcnow()
        starts_at = None
        if when is not None:
            try:
                starts_at = parse_raid_time(when, tz_name=context.guild.timezone, now=now)
            except RaidTimeError as exc:
                return ephemeral_response(exc.user_message)
        outcome = await raid_event_service.edit_event(
            db,
            event=context.event,
            guild=context.guild,
            starts_at=starts_at,
            size_cap=size,
            notes=notes,
            now=now,
        )
        if outcome.min_size is not None:
            return ephemeral_response(raid_copy.size_too_small(outcome.min_size))
        dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=outcome.promoted)

    background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, dm_ids)
    return ephemeral_response(raid_copy.EDIT_DONE)


async def _cancel(interaction: Interaction) -> dict[str, Any]:
    event_id = parse_event_id(interaction.str_option("event"))
    if event_id is None:
        return ephemeral_response(raid_copy.NOT_FOUND)
    reason = _clean_text(interaction.str_option("reason"), MAX_REASON)

    async with unit_of_work() as db:
        context = await load_event(db, interaction, event_id, lock=True, statuses=("scheduled", "cancelled"))
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        if context.event.status == "cancelled":
            return ephemeral_response(raid_copy.ALREADY_CANCELLED)
        await raid_event_service.set_cancel_reason(db, context.event, reason)
        return message_response(cancel_confirm_data(context.event))
