"""The "free my seat?" card's answers.

A seat holder tapping [Tentative] / [Bench] / [Absence] while players are
queued is asked first (see ``raid_signup``), since the seat goes to the
queue at once.  [Yes, free my seat] applies it: the card becomes the
result and the post refreshes via REST.  [Keep my seat] changes nothing.
Both answers re-check that the player still holds a seat.
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_publisher
from app.services.discord.interaction import Interaction, update_text_response
from app.services.discord.raid_context import load_event, signup_refusal, utcnow
from app.services.wow import raid_event_service, raid_signup_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_roster import SEAT_STATUSES


async def handle_release(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Yes, free my seat] — apply the status; the queue moves up into the seat."""
    assert parsed.event_id is not None
    status = parsed.args[0]
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=True)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        refusal = signup_refusal(context.event, utcnow())
        if refusal is not None:
            return update_text_response(refusal)
        mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
        if mine is None:
            return update_text_response(raid_copy.NOT_SIGNED_UP)
        if mine.status == status:
            return update_text_response(raid_copy.already_in_status(status))  # tapped twice
        if mine.status not in SEAT_STATUSES:
            return update_text_response(raid_copy.NO_SEAT_TO_FREE)  # the seat went some other way
        change = await raid_signup_service.change_status(
            db,
            event=context.event,
            discord_user_id=interaction.user_id,
            display_name=interaction.display_name,
            requested_status=status,
            wow_class=mine.wow_class,
            role=mine.role,
            spec=mine.spec,
        )
        dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=change.promoted)

    background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    background.add_task(raid_publisher.notify_promoted, parsed.event_id, dm_ids)
    return update_text_response(raid_copy.seat_released(change.status, handed_on=bool(change.promoted)))


async def handle_stay(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Keep my seat] — nothing changes."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
        mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
        if mine is None:
            return update_text_response(raid_copy.NOT_SIGNED_UP)
        if mine.status not in SEAT_STATUSES:
            return update_text_response(raid_copy.NO_SEAT_TO_FREE)
        return update_text_response(raid_copy.SEAT_KEPT)
