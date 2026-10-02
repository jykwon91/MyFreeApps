"""Buttons on the public raid post + the private class and spec selects.

Flows
-----
* **Class buttons** — [Tank] or a class signs you up in that column in one
  tap, answering UPDATE_MESSAGE (type 7) with the rebuilt post, with the
  spec you saved for the column ([Tank]: your saved tank spec); none saved,
  a private spec select for it.  Your own column (or your tank's class)
  opens that select to switch while you're signed up or queued.  From late,
  tentative, bench or absence your own column signs you straight back up
  with this raid's spec; your tank's class asks.
* **Status buttons** — [Late] / [Tentative] / [Bench] / [Absence] keep your
  spec (this raid's, else the remembered class's saved spec) and change the
  status in one tap; with no spec known, the spec select for the remembered
  class, else the class select.  [Sign up] on posts from before the class
  buttons asks for a seat the same way.
* Landing in the queue (raid full), on the bench, or leaving the queue adds
  a private follow-up; players moved up from the queue get a DM.
* **Menus** — picking a spec saves it as the member's default and edits the
  public post via REST.  [Different class] goes to the class select (Tank,
  then the classes).  Your spec is preselected only when picking it again
  would change nothing: Discord sends nothing for that pick.  Menus opened
  from My sign-up keep the status you have when you pick, however long
  they sat open, and offer [Back].
* **My sign-up** — the private card lives in ``raid_card``.
* **Seat confirm** — a seat holder tapping [Tentative] / [Bench] / [Absence]
  while players are queued gets a private "free my seat?" card first, since
  the seat goes to the queue at once; its answers live in ``raid_seat``.  A
  spec picked for one of those after a queue formed asks the same way (the
  spec is saved, the seat kept until they answer).
* **Limits** — the raid's role and class limits (``raid_limits``) refuse a
  place in line past them, after the started / closed check and before
  "You're already …".  A spec select for a place in line marks the specs
  with no room.  A refused spec brings back its column's spec select, why
  in place of the prompt; with no spec in the column left, why over the
  class select — just why when the column's button on the post was tapped.
  A refused spec is still saved as your spec when you're not on the list
  yet, so [Tentative] is one tap; on the list, your saved spec stays.
* [Absence] never asks for a class.  Same status again → private
  "You're already …" (no-op).  A raid that has started, or whose sign-ups
  the leader closed, refuses every change (menus left open included).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_publisher
from app.services.discord.components.raid_member import reason_reply
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import RaidContext, join_refusal, load_event, signup_refusal, utcnow
from app.services.discord.raid_member_views import reason_row, reason_text
from app.services.discord.raid_views import (
    class_picker_data,
    limit_refusal_data,
    release_confirm_data,
    spec_picker_data,
)
from app.services.wow import raid_event_service, raid_member_prefs_service, raid_signup_service
from app.services.wow.raid_catalog import CLASSES_BY_KEY, POST_COLUMNS, WowSpecInfo, column_specs, spec_info
from app.services.wow.raid_custom_id import SAME_STATUS, RaidCustomId
from app.services.wow.raid_embed import build_signup_message
from app.services.wow.raid_limits import LimitCheck, Limits
from app.services.wow.raid_member_prefs_service import PlayerPick
from app.services.wow.raid_note import asks_reason
from app.services.wow.raid_roster import (
    ABSENCE_STATUS,
    BENCH_STATUS,
    QUEUED_STATUS,
    SEAT_STATUSES,
    TENTATIVE_STATUS,
    hands_seat_to_queue,
)
from app.services.wow.raid_signup_service import StatusChange


@dataclass(frozen=True)
class _Tap:
    """A status change made from a button on the post."""

    change: StatusChange
    spec: WowSpecInfo | None
    dm_ids: list[str]
    message: dict[str, Any] | None  # the rebuilt post; None when nothing changed
    notes_on: bool = False  # the raid takes notes: a tap to late, tentative or absence asks why


async def handle_class_button(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Tank] or a class on the post: one tap with a known spec, else the column's spec select."""
    assert parsed.event_id is not None
    column = parsed.args[0]
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=True)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        refusal = signup_refusal(context.event, utcnow())
        if refusal is not None:
            return ephemeral_response(refusal)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        if (gate := join_refusal(interaction, context, signups)) is not None:
            return ephemeral_response(gate)
        check = LimitCheck(Limits.of(context.event), signups, interaction.user_id, "confirmed")
        spec = await _spec_for_column(db, context, check, column, "confirmed", tapped=True)
        if isinstance(spec, dict):  # a choice to make (the spec select), or no room in the column
            return message_response(spec)
        refused = limit_refusal_data(
            context.event, "confirmed", column, check, emojis=emojis.current(), spec=spec, tapped=True
        )
        if refused is not None:
            return message_response(refused)
        await raid_member_prefs_service.remember_spec(
            db, guild=context.guild, discord_user_id=interaction.user_id, spec=spec
        )
        tap = await _tap(db, context, interaction, "confirmed", PlayerPick(spec.class_key, spec.raid_role, spec.key))
    return _tap_response(interaction, parsed.event_id, tap, "confirmed", background)


async def handle_signup(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Sign up] on posts from before the class buttons: ask for a seat."""
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
        refusal = signup_refusal(event, utcnow())
        if refusal is not None:
            return ephemeral_response(refusal)

        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        if (gate := join_refusal(interaction, context, signups)) is not None:
            return ephemeral_response(gate)
        if hands_seat_to_queue(signups, discord_user_id=interaction.user_id, requested_status=requested):
            return message_response(release_confirm_data(event, requested))
        existing = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        pref = None
        if existing is None or existing.wow_class is None:
            pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=interaction.user_id)
        pick = raid_member_prefs_service.resolve_player(existing, pref)
        check = LimitCheck(Limits.of(event), signups, interaction.user_id, requested)
        if requested != ABSENCE_STATUS and pick.known_spec is None:
            return message_response(_ask_for_spec(event, requested, pick.wow_class, check))
        if pick.known_spec is not None:
            refused = limit_refusal_data(
                event, requested, pick.known_spec.class_key, check, emojis=emojis.current(), spec=pick.known_spec
            )
            if refused is not None:
                return message_response(refused)
        tap = await _tap(db, context, interaction, requested, pick)
    return _tap_response(interaction, event_id, tap, requested, background)


async def _tap(
    db: AsyncSession, context: RaidContext, interaction: Interaction, requested: str, pick: PlayerPick
) -> _Tap:
    """Apply the request; rebuild the post when anything changed."""
    change = await raid_signup_service.change_status(
        db,
        event=context.event,
        discord_user_id=interaction.user_id,
        display_name=interaction.display_name,
        requested_status=requested,
        wow_class=pick.wow_class,
        role=pick.role,
        spec=pick.spec,
    )
    if change.outcome == "unchanged":
        return _Tap(change, pick.known_spec, [], None)
    dm_ids = await raid_event_service.dm_recipients(db, guild=context.guild, user_ids=change.promoted)
    signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
    message = build_signup_message(context.event, signups, context.guild, emojis=emojis.current())
    return _Tap(change, pick.known_spec, dm_ids, message, context.event.signup_notes_enabled)


def _tap_response(
    interaction: Interaction, event_id: uuid.UUID, tap: _Tap, requested: str, background: BackgroundTasks
) -> dict[str, Any]:
    """The rebuilt post (type 7) plus any private follow-up; nothing changed → a private "already".

    The follow-up asks why, with [Add reason], after a tap to late, tentative or absence on a raid taking notes.
    """
    if tap.message is None:
        return ephemeral_response(_already(tap.change, requested, tap.spec))
    background.add_task(raid_publisher.notify_promoted, event_id, tap.dm_ids)
    note = _private_note(tap.change, requested)
    reply = (raid_publisher.send_ephemeral_followup, interaction.application_id, interaction.token)
    if asks_reason(tap.notes_on, tap.change):
        background.add_task(*reply, reason_text(note, tap.change.status), [reason_row(event_id)])
    elif note is not None:
        background.add_task(*reply, note)
    return update_response(tap.message)


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


def _ask_for_spec(event: WowRaidEvent, status: str, wow_class: str | None, check: LimitCheck) -> dict[str, Any]:
    """The spec select when the class is known (or why the limits leave it none), else the class select."""
    if wow_class not in CLASSES_BY_KEY:
        return class_picker_data(event, status, emojis=emojis.current())
    closed = limit_refusal_data(event, status, wow_class, check, emojis=emojis.current())
    if closed is not None:
        return closed
    return spec_picker_data(event, status, wow_class, current=None, emojis=emojis.current(), check=check)


async def _spec_for_column(
    db: AsyncSession, context: RaidContext, check: LimitCheck, column: str, status: str, *, tapped: bool
) -> WowSpecInfo | dict[str, Any]:
    """The spec *column* signs you up with, else what to show instead (a dict).

    That's why the raid's limits leave you no spec in the column, if they
    don't; else your own column (or your tank's class) opens its specs to
    switch.  When picking your spec again would change your status, nothing
    is preselected, since Discord sends nothing for a preselected pick, and
    the column's own button (*tapped*) just signs you back up with it.
    Another column uses the spec you saved for it, else asks.  *check* is
    you asking for *status*; the spec select marks the specs it refuses.
    """
    event = context.event
    closed = limit_refusal_data(event, status, column, check, emojis=emojis.current(), tapped=tapped)
    if closed is not None:
        return closed
    back = status == SAME_STATUS  # opened from My sign-up
    mine = check.mine
    current = _current_spec(mine)
    if mine is not None and current is not None and column in (current.column, current.class_key):
        shown = _shown_spec(mine, column, status)
        if shown is None and tapped and column == current.column:
            return current
        return spec_picker_data(event, status, column, current=shown, emojis=emojis.current(), back=back, check=check)
    pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=check.discord_user_id)
    saved = raid_member_prefs_service.saved_spec_for_column(pref, column)
    if saved is not None:
        return saved
    return spec_picker_data(event, status, column, current=None, emojis=emojis.current(), back=back, check=check)


def _shown_spec(mine: WowRaidSignup | None, column: str, status: str) -> WowSpecInfo | None:
    """Your spec, preselected in *column*'s select only when picking it again would change nothing."""
    current = _current_spec(mine)
    if mine is None or current is None or column not in (current.column, current.class_key):
        return None
    if not _repick_changes_nothing(mine, status):
        return None
    return current


def _repick_changes_nothing(mine: WowRaidSignup, status: str) -> bool:
    """Your spec picked again for *status* keeps the status you have (a queued player stays queued)."""
    if mine.status == QUEUED_STATUS:
        return status in (SAME_STATUS, *SEAT_STATUSES)
    return status in (SAME_STATUS, mine.status)


async def handle_class_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """Class select (Tank or a class): a spec saved for it signs up at once; otherwise ask its spec."""
    assert parsed.event_id is not None
    status = parsed.args[0]
    column = interaction.values[0] if interaction.values else ""
    if column not in POST_COLUMNS:
        return update_text_response(raid_copy.MENU_TIMEOUT)
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        refusal = signup_refusal(context.event, utcnow())
        if refusal is not None:
            return update_text_response(refusal)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        mine = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        asked = _asked_status(status, mine)
        if asked is None:
            return update_text_response(raid_copy.NOT_SIGNED_UP)
        check = LimitCheck(Limits.of(context.event), signups, interaction.user_id, asked)
        spec = await _spec_for_column(db, context, check, column, status, tapped=False)
        if isinstance(spec, dict):
            return update_response(spec)
    return await _finish_pick(interaction, parsed.event_id, status, column, spec, background)


async def handle_spec_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """Spec select (value ``<class>.<spec>``) — save it and sign up."""
    assert parsed.event_id is not None
    column, status = parsed.args
    value = interaction.values[0] if interaction.values else ""
    class_key, _, spec_key = value.partition(".")
    spec = spec_info(class_key, spec_key)
    if spec is None or spec not in column_specs(column):
        return update_text_response(raid_copy.MENU_TIMEOUT)
    return await _finish_pick(interaction, parsed.event_id, status, column, spec, background)


async def handle_pick_class(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Different class] under the spec select — back to the class select."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        refusal = signup_refusal(context.event, utcnow())
        if refusal is not None:
            return update_text_response(refusal)
        status = parsed.args[0]
        return update_response(
            class_picker_data(context.event, status, emojis=emojis.current(), back=status == SAME_STATUS)
        )


async def handle_role_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """A role button from a picker opened before specs existed: ask for the spec instead."""
    assert parsed.event_id is not None
    status, wow_class, _role = parsed.args
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        refusal = signup_refusal(context.event, utcnow())
        if refusal is not None:
            return update_text_response(refusal)
        return update_response(
            spec_picker_data(context.event, status, wow_class, current=None, emojis=emojis.current())
        )


async def _finish_pick(
    interaction: Interaction,
    event_id: uuid.UUID,
    status: str,
    column: str,
    spec: WowSpecInfo,
    background: BackgroundTasks,
) -> dict[str, Any]:
    """Save the spec as the member's default + the signup; refresh the public post via REST.

    The menu may have sat open, so the status is checked against the raid as
    it is now: ``same`` keeps the status the player has, and giving a seat to
    a queue that formed meanwhile asks first, like the buttons on the post.
    The raid's limits are checked against what the pick would change, and a
    refusal brings *column*'s select back.  A refused spec is still saved
    for a player off the list (it makes [Tentative] one tap), never over the
    spec of one on it.
    """
    seat_card: dict[str, Any] | None = None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, event_id, lock=True)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        refusal = signup_refusal(context.event, utcnow())
        if refusal is not None:
            return update_text_response(refusal)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        if (gate := join_refusal(interaction, context, signups)) is not None:
            return update_text_response(gate)
        mine = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        requested = _asked_status(status, mine)
        if requested is None:
            return update_text_response(raid_copy.NOT_SIGNED_UP)
        applied = requested
        if mine is not None and hands_seat_to_queue(
            signups, discord_user_id=interaction.user_id, requested_status=requested
        ):
            applied = mine.status  # save the spec, keep the seat until they answer
            seat_card = release_confirm_data(context.event, requested)
        check = LimitCheck(Limits.of(context.event), signups, interaction.user_id, applied)
        refused = limit_refusal_data(
            context.event,
            status,
            column,
            check,
            emojis=emojis.current(),
            spec=spec,
            current=_shown_spec(mine, column, status),
        )
        if refused is not None:
            if not check.listed:
                await raid_member_prefs_service.remember_spec(
                    db, guild=context.guild, discord_user_id=interaction.user_id, spec=spec
                )
            return update_response(refused)
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
        notes_on = context.event.signup_notes_enabled

    if change.outcome == "changed":
        background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, dm_ids)
    if seat_card is not None:
        return update_response(seat_card)
    return reason_reply(event_id, _pick_result(change, requested, spec, first_save), change, notes_on)


def _asked_status(status: str, mine: WowRaidSignup | None) -> str | None:
    """What a menu's *status* asks for: ``same`` is the status you have, None with none.

    Asking for a seat keeps a queued player's place.
    """
    if status != SAME_STATUS:
        return status
    if mine is None:
        return None
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


def _current_spec(signup: WowRaidSignup | None) -> WowSpecInfo | None:
    if signup is None:
        return None
    return spec_info(signup.wow_class, signup.spec)
