"""Raid: Edit — change a raid from its post's right-click menu.

Right-click a raid post → Apps → **Raid: Edit**.  Only the raid's leader
or someone with Manage Events gets the card (type 4); every button, menu
and form checks again, since a card can sit open while things change.

Flows
-----
* **Title / Date & Time / Description / Image** — a form (type 9) holding
  what's there now.  Its submit saves under the row lock and answers with
  the card again (type 7) saying what changed, or why nothing did; the
  post is re-rendered in the background.  A move reschedules the raid's
  reminders and, while anyone is on the raid, the card offers
  [Tell them in channel] (``raid_leader``: a ping with the new time).
* **Leader / Color** — a menu in place of the card, with [Back].  A leader
  who hands the raid to someone else gets a closing note instead of the
  card when they can't edit it any more.
* **Cancel raid** — a form for the reason, then the usual cancel check
  (``raid_admin.handle_cancel``); its [Keep raid] comes back here.
* **Delete raid** — a check, then the raid, its sign-ups and its pending
  reminders go at once (nobody is told) and the post is removed in the
  background; the card says whether that worked.
* **Done** — the card closes.

A raid that's cancelled or finished can only be deleted.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_publisher
from app.services.discord.interaction import (
    Interaction,
    ephemeral_data,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import RaidContext, load_led_event, load_led_post, may_lead, utcnow
from app.services.discord.raid_edit_views import (
    FIELD,
    cancel_modal,
    color_picker,
    delete_check,
    description_modal,
    edit_card,
    image_modal,
    leader_picker,
    title_modal,
    when_modal,
)
from app.services.discord.raid_views import cancel_confirm_data, unix
from app.services.wow import raid_event_service
from app.services.wow.raid_colors import COLORS_BY_KEY, stored_value
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_details import (
    clean_description,
    clean_reason,
    clean_title,
    image_link,
    stored_title,
)
from app.services.wow.raid_roster import listed_user_ids
from app.services.wow.raid_text import escape_name
from app.services.wow.raid_time_parser import RaidTimeError, parse_raid_time

# A posted raid in any state: one that's over can still be deleted.
_POSTED: Final = ("scheduled", "cancelled", "completed")


@dataclass(frozen=True)
class _Saved:
    """What a form's submit shows, and whether the post needs re-rendering."""

    card: dict[str, Any]
    refresh: bool = True


_Apply = Callable[[AsyncSession, RaidContext, str], Awaitable[_Saved]]


# ---------------------------------------------------------------------------
# The menu command
# ---------------------------------------------------------------------------


async def handle_edit_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    async with unit_of_work() as db:
        found = await load_led_post(db, interaction, lock=False)
        if isinstance(found, str):
            return ephemeral_response(found)
        return message_response(edit_card(found.event))


# ---------------------------------------------------------------------------
# The card's buttons
# ---------------------------------------------------------------------------


async def handle_edit_button(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    action = parsed.args[0]
    if action == "done":
        return update_text_response(raid_copy.EDIT_SAVED)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=action == "keep", statuses=_POSTED)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        if action == "delete":
            signups = await wow_raid_signup_repo.list_for_event(db, event.id)
            return update_response(delete_check(event, len(signups)))
        if event.status != "scheduled":
            return update_response(edit_card(event))
        if action == "keep":
            # Drop the reason staged by the cancel form, so a later cancel doesn't reuse it.
            await raid_event_service.set_cancel_reason(db, event, None)
            return update_response(edit_card(event, notice=raid_copy.CANCEL_KEPT))
        return _open(action, found)


def _open(action: str, found: RaidContext) -> dict[str, Any]:
    """What a property button opens: a form, a menu, or (``back``) the card."""
    event = found.event
    if action == "title":
        return title_modal(event)
    if action == "when":
        return when_modal(event, found.guild.timezone)
    if action == "desc":
        return description_modal(event)
    if action == "image":
        return image_modal(event)
    if action == "cancel":
        return cancel_modal(event)
    if action == "leader":
        return update_response(leader_picker(event))
    if action == "color":
        return update_response(color_picker(event))
    return update_response(edit_card(event))


# ---------------------------------------------------------------------------
# Leader and Color menus
# ---------------------------------------------------------------------------


async def handle_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    if not interaction.values:
        return update_text_response(raid_copy.GENERIC_ERROR)
    choice = interaction.values[0]
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        if parsed.args[0] == "leader":
            saved = await _pick_leader(db, interaction, found, choice)
        else:
            saved = await _pick_color(db, found, choice)
    if saved.refresh:
        background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    return update_response(saved.card)


async def _pick_leader(db: AsyncSession, interaction: Interaction, found: RaidContext, user_id: str) -> _Saved:
    event = found.event
    if interaction.resolved_is_bot(user_id):
        return _Saved(leader_picker(event, notice=raid_copy.LEADER_BOT), refresh=False)
    name = interaction.resolved_display_name(user_id)
    await raid_event_service.set_leader(db, event, user_id=user_id, display_name=name)
    if not may_lead(interaction, event):
        return _Saved(ephemeral_data(raid_copy.handed_over(escape_name(name)), embeds=[]))
    return _Saved(edit_card(event, notice=raid_copy.leader_ok(escape_name(name))))


async def _pick_color(db: AsyncSession, found: RaidContext, key: str) -> _Saved:
    event = found.event
    color = COLORS_BY_KEY.get(key)
    if color is None:
        return _Saved(color_picker(event), refresh=False)
    await raid_event_service.set_color(db, event, stored_value(color))
    notice = raid_copy.COLOR_OK
    if event.closed_at is not None:
        notice = raid_copy.COLOR_OK_CLOSED
    return _Saved(edit_card(event, notice=notice))


# ---------------------------------------------------------------------------
# The forms' submits
# ---------------------------------------------------------------------------


async def handle_title_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_title)


async def handle_when_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_when)


async def handle_description_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_description)


async def handle_image_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_image)


async def handle_cancel_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_cancel)


async def _submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks, apply: _Apply
) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        saved = await apply(db, found, interaction.fields.get(FIELD, ""))
    if saved.refresh:
        background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    return update_response(saved.card)


async def _apply_title(db: AsyncSession, found: RaidContext, text: str) -> _Saved:
    event = found.event
    title = clean_title(text)
    if not title:
        return _Saved(edit_card(event, notice=raid_copy.TITLE_EMPTY), refresh=False)
    await raid_event_service.set_title(db, event, stored_title(event.raid_key, title))
    return _Saved(edit_card(event, notice=raid_copy.TITLE_OK))


async def _apply_when(db: AsyncSession, found: RaidContext, text: str) -> _Saved:
    event = found.event
    now = utcnow()
    try:
        starts_at = parse_raid_time(text, tz_name=found.guild.timezone, now=now)
    except RaidTimeError as exc:
        return _Saved(edit_card(event, notice=exc.user_message), refresh=False)
    if starts_at == event.starts_at:
        return _Saved(edit_card(event, notice=raid_copy.WHEN_SAME), refresh=False)
    await raid_event_service.edit_event(
        db, event=event, guild=found.guild, starts_at=starts_at, size_cap=None, notes=None, now=now
    )
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    notice = raid_copy.moved(unix(starts_at))
    return _Saved(edit_card(event, notice=notice, notify_count=len(listed_user_ids(signups))))


async def _apply_description(db: AsyncSession, found: RaidContext, text: str) -> _Saved:
    notes = clean_description(text)
    await raid_event_service.set_description(db, found.event, notes)
    notice = raid_copy.DESC_OK
    if notes is None:
        notice = raid_copy.DESC_CLEARED
    return _Saved(edit_card(found.event, notice=notice))


async def _apply_image(db: AsyncSession, found: RaidContext, text: str) -> _Saved:
    try:
        link = image_link(text)
    except ValueError:
        return _Saved(edit_card(found.event, notice=raid_copy.BANNER_BAD), refresh=False)
    await raid_event_service.set_banner(db, found.event, link)
    notice = raid_copy.BANNER_OK
    if link is None:
        notice = raid_copy.BANNER_RESET
    return _Saved(edit_card(found.event, notice=notice))


async def _apply_cancel(db: AsyncSession, found: RaidContext, text: str) -> _Saved:
    """Stage the reason and ask once more; [Cancel raid] there does the cancelling."""
    await raid_event_service.set_cancel_reason(db, found.event, clean_reason(text))
    return _Saved(cancel_confirm_data(found.event, from_edit=True), refresh=False)


# ---------------------------------------------------------------------------
# [Delete raid] on the delete check
# ---------------------------------------------------------------------------


async def handle_delete(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_POSTED)
        if isinstance(found, str):
            return update_text_response(found)
        channel_id = found.event.channel_id
        message_id = found.event.message_id
        await raid_event_service.delete_event(db, found.event)
    background.add_task(
        raid_publisher.delete_post, channel_id, message_id, interaction.application_id, interaction.token
    )
    return update_text_response(raid_copy.DELETING)
