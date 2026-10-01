"""Signup buttons on the public raid post + the first-time class/role picker.

Flows
-----
* **One tap** — [Sign up] / [Tentative] / [Late] / [Decline] with a known
  class/role (from this raid's signup, else saved prefs) changes the status
  and answers UPDATE_MESSAGE (type 7) with the rebuilt post.  Landing on the
  bench adds a private follow-up; promoted players get a DM.
* **First time** — no class/role known: a private class select, then
  class-filtered role buttons (skipped for single-role classes).  Finishing
  saves prefs + the signup and edits the public post via REST.
* Same status again → private "You're already …" (no-op).
* A raid that has started refuses every button.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_publisher
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import load_event, utcnow
from app.services.discord.raid_views import (
    class_picker_data,
    my_signup_data,
    role_picker_data,
    roster_data,
)
from app.services.wow import raid_event_service, raid_member_prefs_service, raid_signup_service
from app.services.wow.raid_catalog import CLASSES_BY_KEY
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_embed import build_signup_message
from app.services.wow.raid_roster import BENCH_STATUS


async def handle_signup(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    return await _request_status(interaction, parsed.event_id, "confirmed", background)


async def handle_status(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    return await _request_status(interaction, parsed.event_id, parsed.args[0], background)


async def _request_status(
    interaction: Interaction, event_id: uuid.UUID, requested: str, background: BackgroundTasks
) -> dict[str, Any]:
    async with unit_of_work() as db:
        context = await load_event(db, interaction, event_id, lock=True)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        event = context.event
        if event.starts_at <= utcnow():
            return ephemeral_response(raid_copy.RAID_STARTED)

        existing = await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id=interaction.user_id)
        wow_class = None
        role = None
        if existing is not None:
            wow_class = existing.wow_class
            role = existing.role
        if wow_class is None or role is None:
            pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=interaction.user_id)
            if raid_member_prefs_service.one_tap_ready(pref):
                assert pref is not None
                wow_class = pref.default_wow_class
                role = pref.default_role
            elif requested != "declined":
                return message_response(class_picker_data(event, requested))

        change = await raid_signup_service.change_status(
            db,
            event=event,
            discord_user_id=interaction.user_id,
            display_name=interaction.display_name,
            requested_status=requested,
            wow_class=wow_class,
            role=role,
        )
        if change.outcome == "unchanged":
            return ephemeral_response(raid_copy.already_in_status(change.status))
        dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=change.promoted)
        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        message = build_signup_message(event, signups, context.guild)

    background.add_task(raid_publisher.notify_promoted, event_id, dm_ids)
    if change.benched:
        background.add_task(
            raid_publisher.send_ephemeral_followup, interaction.application_id, interaction.token, raid_copy.BENCHED
        )
    return update_response(message)


async def handle_class_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    status = parsed.args[0]
    wow_class = interaction.values[0] if interaction.values else ""
    info = CLASSES_BY_KEY.get(wow_class)
    if info is None:
        return update_text_response(raid_copy.MENU_TIMEOUT)
    if len(info.roles) == 1:
        return await _finish_pick(interaction, parsed.event_id, status, wow_class, info.roles[0], background)
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        return update_response(role_picker_data(context.event, status, wow_class))


async def handle_role_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    status, wow_class, role = parsed.args
    return await _finish_pick(interaction, parsed.event_id, status, wow_class, role, background)


async def _finish_pick(
    interaction: Interaction,
    event_id: uuid.UUID,
    status: str,
    wow_class: str,
    role: str,
    background: BackgroundTasks,
) -> dict[str, Any]:
    """Save prefs + signup from the private picker; refresh the public post via REST."""
    async with unit_of_work() as db:
        context = await load_event(db, interaction, event_id, lock=True)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
        await raid_member_prefs_service.remember_class_role(
            db, guild=context.guild, discord_user_id=interaction.user_id, wow_class=wow_class, role=role
        )
        change = await raid_signup_service.change_status(
            db,
            event=context.event,
            discord_user_id=interaction.user_id,
            display_name=interaction.display_name,
            requested_status=status,
            wow_class=wow_class,
            role=role,
        )
        dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=change.promoted)

    if change.outcome == "changed":
        background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, dm_ids)
    text = raid_copy.SAVED_ONE_TAP
    if change.benched:
        text = f"{text}\n{raid_copy.BENCHED}"
    return update_text_response(text)


async def handle_mine(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        mine = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        return message_response(my_signup_data(context.event, mine, signups))


async def handle_change(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Change class or role] on "My signup" — reopen the picker keeping the status."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
        if mine is None:
            return update_text_response(raid_copy.NOT_SIGNED_UP)
        # Bench isn't requestable; asking for a seat keeps a benched player benched while full.
        status = mine.status
        if status == BENCH_STATUS:
            status = "confirmed"
        return update_response(class_picker_data(context.event, status))


async def handle_roster(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        return message_response(roster_data(context.event, signups, context.guild))
