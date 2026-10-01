"""Signup buttons on the public raid post + the private class and spec selects.

Flows
-----
* **One tap** — [Sign up] / [Late] / [Tentative] / [Bench] / [Absence] with
  a known class and spec (this raid's signup, else the remembered class's
  saved spec) changes the status and answers UPDATE_MESSAGE (type 7) with
  the rebuilt post.  Landing in the queue (raid full), on the bench, or
  leaving the queue adds a private follow-up; players moved up from the
  queue get a DM.
* **Spec unknown** — the class is known (this raid's signup, else the
  remembered class) but not its spec: a private spec select for that class,
  with [Different class] for the class select.  Signups saved before specs
  existed take this path once.
* **First time** — no class known: a private class select, then the spec
  select (skipped when that class already has a saved spec).  Finishing
  saves prefs + the signup and edits the public post via REST.
* **Change class or spec** (My signup) — the spec select for your class with
  your spec preselected; picking your own class again does the same.  These
  menus keep the status you have when you pick, however long they sat open.
* **Seat confirm** — a seat holder tapping [Tentative] / [Bench] / [Absence]
  while players are queued gets a private "free my seat?" card first, since
  the seat goes to the queue at once: [Yes, free my seat] applies it (the
  card becomes the result, the post refreshes via REST), [Keep my seat]
  changes nothing.  A spec picked for one of those after a queue formed
  asks the same way (the spec is saved, the seat kept until they answer).
  Both answers re-check that the player still holds a seat.
* [Absence] never asks for a class.  Same status again → private
  "You're already …" (no-op).  A raid that has started refuses every button.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_publisher
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
    release_confirm_data,
    roster_data,
    spec_picker_data,
)
from app.services.wow import raid_event_service, raid_member_prefs_service, raid_signup_service
from app.services.wow.raid_catalog import CLASSES_BY_KEY, WowSpecInfo, spec_info
from app.services.wow.raid_custom_id import SAME_STATUS, RaidCustomId
from app.services.wow.raid_embed import build_signup_message
from app.services.wow.raid_roster import (
    ABSENCE_STATUS,
    BENCH_STATUS,
    QUEUED_STATUS,
    SEAT_STATUSES,
    TENTATIVE_STATUS,
    hands_seat_to_queue,
)
from app.services.wow.raid_signup_service import StatusChange


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

        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        if hands_seat_to_queue(signups, discord_user_id=interaction.user_id, requested_status=requested):
            return message_response(release_confirm_data(event, requested))
        existing = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        pref = None
        if existing is None or existing.wow_class is None:
            pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=interaction.user_id)
        pick = raid_member_prefs_service.resolve_player(existing, pref)
        if requested != ABSENCE_STATUS and pick.known_spec is None:
            return message_response(_ask_for_spec(event, requested, pick.wow_class))

        change = await raid_signup_service.change_status(
            db,
            event=event,
            discord_user_id=interaction.user_id,
            display_name=interaction.display_name,
            requested_status=requested,
            wow_class=pick.wow_class,
            role=pick.role,
            spec=pick.spec,
        )
        if change.outcome == "unchanged":
            return ephemeral_response(_already(change, requested, pick.known_spec))
        dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=change.promoted)
        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        message = build_signup_message(event, signups, context.guild, emojis=emojis.current())

    background.add_task(raid_publisher.notify_promoted, event_id, dm_ids)
    note = _private_note(change, requested)
    if note is not None:
        background.add_task(
            raid_publisher.send_ephemeral_followup, interaction.application_id, interaction.token, note
        )
    return update_response(message)


def _private_note(change: StatusChange, requested: str) -> str | None:
    """What the public post can't say: your place in the queue, what bench means, or that you left the queue."""
    if change.queued:
        return raid_copy.queued_note(change.queue_position, asked_late=requested == "late")
    if change.status == BENCH_STATUS:
        return raid_copy.BENCH_NOTE
    if _left_the_queue(change):
        return raid_copy.LEFT_QUEUE
    return None


def _left_the_queue(change: StatusChange) -> bool:
    """A queued player chose tentative or absence (the bench note covers the bench)."""
    return change.previous == QUEUED_STATUS and change.status in (TENTATIVE_STATUS, ABSENCE_STATUS)


def _already(change: StatusChange, requested: str, spec: WowSpecInfo | None) -> str:
    """Same status again — say so, pointing at what they probably wanted."""
    return raid_copy.already_in_status(
        change.status,
        spec_label=spec.full_label if spec is not None else None,
        queue_position=change.queue_position,
        asked_late=requested == "late",
    )


def _ask_for_spec(event: WowRaidEvent, status: str, wow_class: str | None) -> dict[str, Any]:
    """The spec select when the class is known, else the class select."""
    if wow_class in CLASSES_BY_KEY:
        return spec_picker_data(event, status, wow_class, current=None, emojis=emojis.current())
    return class_picker_data(event, status, emojis=emojis.current())


async def handle_class_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """Class select: a class with a saved spec signs up at once; otherwise ask its spec."""
    assert parsed.event_id is not None
    status = parsed.args[0]
    wow_class = interaction.values[0] if interaction.values else ""
    if wow_class not in CLASSES_BY_KEY:
        return update_text_response(raid_copy.MENU_TIMEOUT)
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
        mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
        current = _current_spec(mine)
        if current is not None and current.class_key == wow_class:
            # Your own class again: show its specs with yours preselected.
            return update_response(
                spec_picker_data(context.event, status, wow_class, current=current, emojis=emojis.current())
            )
        pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=interaction.user_id)
        saved = raid_member_prefs_service.saved_spec_for(pref, wow_class)
        if saved is None:
            return update_response(
                spec_picker_data(context.event, status, wow_class, current=None, emojis=emojis.current())
            )
    return await _finish_pick(interaction, parsed.event_id, status, saved, background)


async def handle_spec_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """Spec select (value ``<class>.<spec>``) — save it and sign up."""
    assert parsed.event_id is not None
    wow_class, status = parsed.args
    value = interaction.values[0] if interaction.values else ""
    class_key, _, spec_key = value.partition(".")
    spec = spec_info(class_key, spec_key)
    if spec is None or spec.class_key != wow_class:
        return update_text_response(raid_copy.MENU_TIMEOUT)
    return await _finish_pick(interaction, parsed.event_id, status, spec, background)


async def handle_pick_class(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Different class] under the spec select — back to the class select."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
        return update_response(class_picker_data(context.event, parsed.args[0], emojis=emojis.current()))


async def handle_role_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """A role button from a picker opened before specs existed: ask for the spec instead."""
    assert parsed.event_id is not None
    status, wow_class, _role = parsed.args
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
        return update_response(
            spec_picker_data(context.event, status, wow_class, current=None, emojis=emojis.current())
        )


async def _finish_pick(
    interaction: Interaction,
    event_id: uuid.UUID,
    status: str,
    spec: WowSpecInfo,
    background: BackgroundTasks,
) -> dict[str, Any]:
    """Save the spec as the member's default + the signup; refresh the public post via REST.

    The menu may have sat open, so the status is checked against the raid as
    it is now: ``same`` keeps the status the player has, and giving a seat to
    a queue that formed meanwhile asks first, like the buttons on the post.
    """
    seat_card: dict[str, Any] | None = None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, event_id, lock=True)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        mine = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        requested = status
        if status == SAME_STATUS:
            if mine is None:
                return update_text_response(raid_copy.NOT_SIGNED_UP)
            requested = _status_to_keep(mine)
        applied = requested
        if mine is not None and hands_seat_to_queue(
            signups, discord_user_id=interaction.user_id, requested_status=requested
        ):
            applied = mine.status  # save the spec, keep the seat until they answer
            seat_card = release_confirm_data(context.event, requested)
        first_save = await raid_member_prefs_service.remember_spec(
            db, guild=context.guild, discord_user_id=interaction.user_id, spec=spec
        )
        change = await raid_signup_service.change_status(
            db,
            event=context.event,
            discord_user_id=interaction.user_id,
            display_name=interaction.display_name,
            requested_status=applied,
            wow_class=spec.class_key,
            role=spec.raid_role,
            spec=spec.key,
        )
        dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=change.promoted)

    if change.outcome == "changed":
        background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, dm_ids)
    if seat_card is not None:
        return update_response(seat_card)
    return update_text_response(_pick_result(change, requested, spec, first_save))


def _status_to_keep(mine: WowRaidSignup) -> str:
    """``same``: the status you have now — asking for a seat keeps a queued player's place."""
    if mine.status == QUEUED_STATUS:
        return "confirmed"
    return mine.status


def _pick_result(change: StatusChange, requested: str, spec: WowSpecInfo, first_save: bool) -> str:
    """The line that replaces the select once a spec is picked."""
    label = spec.full_label
    if change.outcome == "unchanged":
        text = _already(change, requested, spec)
    elif change.queued:
        note = raid_copy.queued_note(change.queue_position, asked_late=requested == "late")
        text = f"{raid_copy.saved_as(label)}\n{note}"
    elif change.status != "confirmed":
        text = raid_copy.marked_as(change.status, label)
        if _left_the_queue(change):
            text = f"{text}\n{raid_copy.LEFT_QUEUE}"
    elif change.previous == "confirmed":
        text = raid_copy.switched_to(label)
    else:
        text = raid_copy.signed_up_as(label)
    if first_save:
        text = f"{text} {raid_copy.NEXT_TIME_ONE_TAP}"
    return text


async def handle_release(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Yes, free my seat] — apply the status; the queue moves up into the seat."""
    assert parsed.event_id is not None
    status = parsed.args[0]
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=True)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        if context.event.starts_at <= utcnow():
            return update_text_response(raid_copy.RAID_STARTED)
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


def _current_spec(signup: WowRaidSignup | None) -> WowSpecInfo | None:
    if signup is None:
        return None
    return spec_info(signup.wow_class, signup.spec)


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
    """[Change class or spec] on "My signup" — the spec select for your class, keeping the status."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
        if mine is None:
            return update_text_response(raid_copy.NOT_SIGNED_UP)
        # The menus carry ``same``: you keep the status you have when you pick.
        if mine.wow_class not in CLASSES_BY_KEY:
            return update_response(class_picker_data(context.event, SAME_STATUS, emojis=emojis.current()))
        current = _current_spec(mine)
        return update_response(
            spec_picker_data(context.event, SAME_STATUS, mine.wow_class, current=current, emojis=emojis.current())
        )


async def handle_roster(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        return message_response(roster_data(context.event, signups, context.guild, emojis=emojis.current()))
