"""My sign-up's own changes: [Character name] and its form, [Add note] and its form, and [Forget my specs].

[Character name] opens a one-box form (type 9) holding the name this
sign-up shows, else the one saved for its class.  The submit checks the
name before touching the database: one the game wouldn't take gets a new
private message saying why (a form can't open again from its submit).  A
good one, or an empty box (back to the Discord name), is saved on the
sign-up and for its class, and the card comes back saying what changed
(type 7); the raid post is redrawn when the name it shows changed.  Both
refuse once the raid has started; closed sign-ups still take a name.

[Add note] / [Edit note] opens a one-box form holding the member's note
for the raid leader, while the raid takes notes.  Its submit keeps what
``raid_note.clean_note`` keeps (an empty box removes the note) and brings
the card back saying what changed; the raid post never shows notes, so it
isn't redrawn.  [Add reason], under the reply to a tap that made the
member late, tentative or absent, opens the same form; its submit answers
in place of the reply, in words only.  Any sign-up may take a note, and
closed sign-ups still do; a started raid, or notes turned off meanwhile,
refuse.

[Forget my specs] asks first, listing what's saved; [Yes, forget them]
forgets the remembered class and every saved spec, keeping sign-ups,
character names and the DM setting, and brings the card back saying so
(the raid post doesn't change, so it works on any raid still on).
"""
from __future__ import annotations

import uuid
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_member_copy, raid_publisher
from app.services.discord.interaction import Interaction, ephemeral_response, update_response, update_text_response
from app.services.discord.raid_context import RaidContext, load_event, started_refusal, utcnow
from app.services.discord.raid_forms import FIELD
from app.services.discord.raid_member_views import (
    character_form,
    forget_confirm_data,
    my_signup_data,
    note_form,
    reason_offer_data,
    reason_text,
)
from app.services.wow import raid_member_prefs_service, raid_signup_service
from app.services.wow.raid_character import CharacterNameError, clean_name
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_note import asks_reason, clean_note
from app.services.wow.raid_roster import ABSENCE_STATUS
from app.services.wow.raid_signup_service import StatusChange


async def my_card(db: AsyncSession, context: RaidContext, user_id: str, *, notice: str | None = None) -> dict[str, Any]:
    """The My sign-up card for *user_id*, *notice* (what the last tap did) on top."""
    signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
    mine = next((s for s in signups if s.discord_user_id == user_id), None)
    can_forget = False
    if mine is not None:
        pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=user_id)
        can_forget = raid_member_prefs_service.has_saved_specs(pref)
    return my_signup_data(
        context.event, mine, signups, emojis=emojis.current(), can_forget=can_forget, notice=notice
    )


async def handle_character(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """[Character name] — the form, holding the name shown now (else the one saved for the class)."""
    async with unit_of_work() as db:
        found = await _named_signup(db, interaction, parsed, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        context, mine = found
        name = mine.character_name
        if name is None:
            pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=interaction.user_id)
            name = raid_member_prefs_service.saved_name_for(pref, mine.wow_class)
        return character_form(context.event, name)


async def handle_character_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The form's submit: save the name on the sign-up and for its class, then show the card."""
    try:
        name = clean_name(interaction.fields.get(FIELD, ""))
    except CharacterNameError as problem:
        return ephemeral_response(raid_member_copy.name_refusal(problem.reason, problem.length))
    async with unit_of_work() as db:
        found = await _named_signup(db, interaction, parsed, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        context, mine = found
        change = await raid_signup_service.set_character_name(db, guild=context.guild, signup=mine, name=name)
        notice = raid_member_copy.name_saved(name, change.shown or change.remembered)
        card = await my_card(db, context, interaction.user_id, notice=notice)
    if change.shown:
        background.add_task(raid_publisher.refresh_public_message, context.event.id)
    return update_response(card)


async def handle_forget(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Forget my specs] — the card asking first; with nothing saved (forgotten elsewhere) the card says so."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        pref = await raid_member_prefs_service.get(db, guild=context.guild, discord_user_id=interaction.user_id)
        if not raid_member_prefs_service.has_saved_specs(pref):
            notice = raid_member_copy.FORGET_NOTHING
            return update_response(await my_card(db, context, interaction.user_id, notice=notice))
        return update_response(forget_confirm_data(context.event, pref))


async def handle_forget_yes(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """[Yes, forget them] — forget the saved class and specs; the card comes back saying so."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        forgot = await raid_member_prefs_service.forget_specs(
            db, guild=context.guild, discord_user_id=interaction.user_id
        )
        notice = raid_member_copy.FORGET_NOTHING
        if forgot:
            notice = raid_member_copy.FORGET_DONE
        return update_response(await my_card(db, context, interaction.user_id, notice=notice))


async def handle_note(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Add note] / [Edit note] / [Add reason] — the note form, holding the note there now."""
    async with unit_of_work() as db:
        found = await _noted_signup(db, interaction, parsed, lock=False, notes_off=raid_member_copy.NOTES_OFF_NOW)
        if isinstance(found, str):
            return update_text_response(found)
        context, mine = found
        return note_form(context.event, parsed.args[0], mine)


async def handle_note_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The note form's submit: save the note (an empty box removes it), then the card; from [Add reason], words."""
    note = clean_note(interaction.fields.get(FIELD, ""))
    async with unit_of_work() as db:
        found = await _noted_signup(db, interaction, parsed, lock=True, notes_off=raid_member_copy.NOTE_NOT_SAVED)
        if isinstance(found, str):
            return update_text_response(found)
        context, mine = found
        changed = await raid_signup_service.set_note(db, signup=mine, note=note)
        notice = raid_member_copy.note_saved(note, changed)
        if parsed.args[0] == "reason":
            return update_text_response(notice)
        return update_response(await my_card(db, context, interaction.user_id, notice=notice))


def reason_reply(event_id: uuid.UUID, text: str, change: StatusChange, notes_on: bool) -> dict[str, Any]:
    """*text* in place of the menu or card (type 7); after a change to late, tentative or absence, asking why."""
    if not asks_reason(notes_on, change):
        return update_text_response(text)
    return update_response(reason_offer_data(event_id, reason_text(text, change.status)))


async def _noted_signup(
    db: AsyncSession, interaction: Interaction, parsed: RaidCustomId, *, lock: bool, notes_off: str
) -> tuple[RaidContext, WowRaidSignup] | str:
    """The raid and this member's sign-up, when it can take a note; else why not (*notes_off* when they're off)."""
    assert parsed.event_id is not None
    context = await load_event(db, interaction, parsed.event_id, lock=lock)
    if context is None:
        return raid_copy.NOT_FOUND
    refusal = started_refusal(context.event, utcnow())  # a card opened before the raid started
    if refusal is not None:
        return refusal
    mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
    if mine is None:
        return raid_copy.NOT_SIGNED_UP
    if not context.event.signup_notes_enabled:
        return notes_off
    return context, mine


async def _named_signup(
    db: AsyncSession, interaction: Interaction, parsed: RaidCustomId, *, lock: bool
) -> tuple[RaidContext, WowRaidSignup] | str:
    """The raid and this member's sign-up, when it can take a character name; else why not."""
    assert parsed.event_id is not None
    context = await load_event(db, interaction, parsed.event_id, lock=lock)
    if context is None:
        return raid_copy.NOT_FOUND
    refusal = started_refusal(context.event, utcnow())  # a card opened before the raid started
    if refusal is not None:
        return refusal
    mine = await wow_raid_signup_repo.get(db, event_id=context.event.id, discord_user_id=interaction.user_id)
    if mine is None:
        return raid_copy.NOT_SIGNED_UP
    if mine.wow_class is None or mine.status == ABSENCE_STATUS:
        return raid_member_copy.CHAR_NO_CLASS
    return context, mine


# My sign-up's buttons this module answers (``raid:v1:card:<event>:<view>``); ``raid_card`` routes them here.
CARD_BUTTONS: Final = {
    "char": handle_character,
    "forget": handle_forget,
    "forgetyes": handle_forget_yes,
    "note": handle_note,
    "reason": handle_note,
}
