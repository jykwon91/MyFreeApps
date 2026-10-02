"""Raid: Unsigned — who hasn't signed up for a raid, and [Ping them]; /raid-admin raiders.

Right-click a raid post → Apps → Raid: Unsigned, or [Not signed up] on Raid:
Signed.  Its leader, or anyone with Manage Events (``load_led_post`` /
``load_led_event``), on a raid that's on or done.

Discord's member list takes a moment to read, so every answer is "Checking…"
first — deferred (type 5) from the menu, in place (type 7) from a card — and
``raid_unsigned`` edits the card once the list is read.

Flows
-----
* **The role menu** (while the raid is on) saves the roles checked for this
  raid, under its row lock; emptying it, or picking the roles it checks
  anyway, goes back to the default.  ``@everyone`` is refused.
* **[Ping them]** — a form (type 9) prefilled with a nudge to sign up.  Its
  submit claims the raid's Unsigned ping slot under the row lock (one per
  raid every few minutes; Raid: Signed's ping has its own), answers
  "Checking who to ping…" and pings, in the background, whoever still
  hasn't signed up.  A raid that started, closed or was pinged too recently
  shows the list again saying why.
* **[Refresh]** reads the list again; **[Back]** is Raid: Signed.
* **/raid-admin raiders** (Manage Server) — the server's raider roles in a
  menu; emptying it clears them.
"""
from __future__ import annotations

import uuid
from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_GUILD

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_unsigned, raid_unsigned_copy
from app.services.discord.interaction import (
    Interaction,
    deferred_ephemeral_response,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import (
    RaidContext,
    load_configured_guild,
    load_led_event,
    load_led_post,
    utcnow,
)
from app.services.discord.raid_leader_views import PING_FIELD, PING_MAX_CHARS, signed_data
from app.services.discord.raid_unsigned_views import checking_data, no_pool_data, unsigned_ping_modal
from app.services.discord.raid_views import unix
from app.services.wow import raid_unsigned_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_roles import picked_roles
from app.services.wow.raid_text import escape_name, title_text
from app.services.wow.raid_unsigned import default_pool, ping_ready, pool_for, raid_block

# The raids whose list shows: one that's on, or done (who never answered).
_SHOWN: Final = ("scheduled", "completed")


async def handle_unsigned_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    """Raid: Unsigned on a raid post: who hasn't signed up, read in the background."""
    async with unit_of_work() as db:
        found = await load_led_post(db, interaction, lock=False)
        if isinstance(found, str):
            return ephemeral_response(found)
        event = found.event
        if event.status == "cancelled":
            return ephemeral_response(raid_copy.ALREADY_CANCELLED)
        if not pool_for(event, found.guild).role_ids:
            return message_response(no_pool_data(event, admin=interaction.has_permission(MANAGE_GUILD)))
    background.add_task(raid_unsigned.show_list, _list_job(interaction, event.id))
    return deferred_ephemeral_response()


async def handle_unsigned(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """[Not signed up], and the list's role menu, [Ping them], [Refresh] and [Back]."""
    assert parsed.event_id is not None
    verb = parsed.args[0]
    if verb == "roles":
        return await _pick_roles(interaction, parsed.event_id, background)
    if verb == "ping":
        return await _open_ping(interaction, parsed.event_id, background)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=False, statuses=_SHOWN)
        if isinstance(found, str):
            return update_text_response(found)
        if verb == "back":
            signups = await wow_raid_signup_repo.list_for_event(db, found.event.id)
            return update_response(signed_data(found.event, signups, emojis=emojis.current()))
    return _checking(interaction, found.event.id, background)


async def handle_ping_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The [Ping them] form: claim the slot, then ping whoever still hasn't signed up."""
    assert parsed.event_id is not None
    text = interaction.fields.get(PING_FIELD, "").strip()[:PING_MAX_CHARS]
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        now = utcnow()
        block = raid_block(event, now)
        if block is not None:
            return _checking(interaction, event.id, background, notice=raid_unsigned_copy.ping_refused(block))
        if not text:
            return _checking(interaction, event.id, background, notice=raid_copy.PING_EMPTY)
        if not await raid_unsigned_service.claim_ping(db, event, now=now):
            return _checking(interaction, event.id, background, notice=raid_copy.PING_WAIT)
        job = raid_unsigned.UnsignedPingJob(
            event_id=event.id,
            channel_id=event.channel_id,
            text=text,
            signature=raid_copy.ping_signature(
                title_text(event), unix(event.starts_at), escape_name(interaction.display_name)
            ),
            application_id=interaction.application_id,
            token=interaction.token,
            claimed_at=now,
        )
    background.add_task(raid_unsigned.send_ping, job)
    return update_response(checking_data(raid_unsigned_copy.CHECKING_PING))


async def handle_raiders_pick(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The /raid-admin raiders menu: save the server's raider roles (Manage Server, checked again)."""
    if not interaction.has_permission(MANAGE_GUILD):
        return update_text_response(raid_copy.NOT_PERMITTED_GUILD)
    picked, everyone = picked_roles(interaction.values, everyone_id=interaction.guild_id)
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return update_text_response(raid_copy.NOT_CONFIGURED)
        notice = raid_unsigned_copy.EVERYONE_REFUSED
        if picked or not everyone:
            await raid_unsigned_service.set_server_roles(db, guild, picked)
            notes = [raid_unsigned_copy.RAIDERS_CLEARED]
            if picked:
                notes = [raid_unsigned_copy.raiders_saved(picked)]
            notice = _with_everyone(notes, everyone)
    background.add_task(raid_unsigned.show_raiders, _raiders_job(interaction, notice))
    return update_response(checking_data(raid_unsigned_copy.CHECKING_ROLES))


async def open_raiders(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    """``/raid-admin raiders`` (Manage Server): the server's raider roles, read in the background."""
    if not interaction.has_permission(MANAGE_GUILD):
        return ephemeral_response(raid_copy.NOT_PERMITTED_GUILD)
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
    if guild is None:
        return ephemeral_response(raid_copy.NOT_CONFIGURED)
    background.add_task(raid_unsigned.show_raiders, _raiders_job(interaction, None))
    return deferred_ephemeral_response()


async def _pick_roles(interaction: Interaction, event_id: uuid.UUID, background: BackgroundTasks) -> dict[str, Any]:
    """The role menu: the roles checked for this raid (under its row lock), then the list again."""
    picked, everyone = picked_roles(interaction.values, everyone_id=interaction.guild_id)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        notice = raid_unsigned_copy.EVERYONE_REFUSED
        if picked or not everyone:
            notice = await _save_raid_roles(db, found, picked, everyone)
    return _checking(interaction, event_id, background, notice=notice)


async def _save_raid_roles(db: Any, found: RaidContext, picked: list[str], everyone: bool) -> str:
    """Save the roles picked for the raid; what the card says about it."""
    inherited = default_pool(found.event, found.guild)
    notes = [raid_unsigned_copy.ROLES_RESET]
    if await raid_unsigned_service.set_raid_roles(db, found.event, picked, inherited=inherited):
        notes = [raid_unsigned_copy.roles_saved(picked)]
    return _with_everyone(notes, everyone)


def _with_everyone(notes: list[str], everyone: bool) -> str:
    """*notes*, then that @everyone was left out when it was picked."""
    if everyone:
        notes.append(raid_unsigned_copy.EVERYONE_REFUSED)
    return " ".join(notes)


async def _open_ping(interaction: Interaction, event_id: uuid.UUID, background: BackgroundTasks) -> dict[str, Any]:
    """[Ping them]: the form, unless the raid can't take a ping now (then the list again, saying why)."""
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
    event, now = found.event, utcnow()
    block = raid_block(event, now)
    if block is not None:
        return _checking(interaction, event.id, background, notice=raid_unsigned_copy.ping_refused(block))
    if not ping_ready(event, now):
        return _checking(interaction, event.id, background, notice=raid_copy.PING_WAIT)
    return unsigned_ping_modal(event)


def _checking(
    interaction: Interaction, event_id: uuid.UUID, background: BackgroundTasks, *, notice: str | None = None
) -> dict[str, Any]:
    """'Checking…' in place of the card, and the list read in the background."""
    background.add_task(raid_unsigned.show_list, _list_job(interaction, event_id, notice))
    return update_response(checking_data(raid_unsigned_copy.CHECKING))


def _list_job(interaction: Interaction, event_id: uuid.UUID, notice: str | None = None) -> raid_unsigned.ListJob:
    return raid_unsigned.ListJob(
        event_id=event_id,
        application_id=interaction.application_id,
        token=interaction.token,
        admin=interaction.has_permission(MANAGE_GUILD),
        notice=notice,
    )


def _raiders_job(interaction: Interaction, notice: str | None) -> raid_unsigned.RaidersJob:
    assert interaction.guild_id is not None
    return raid_unsigned.RaidersJob(
        guild_discord_id=interaction.guild_id,
        application_id=interaction.application_id,
        token=interaction.token,
        notice=notice,
    )
