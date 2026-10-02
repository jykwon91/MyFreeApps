"""The raid post's right-click menu — Raid: Close, Raid: Open, Raid: Signed.

Right-click a raid post → Apps.  Each menu command finds its raid by the
post's message id and answers privately (type 4).  Only the raid's leader
(whoever created it) or someone with Manage Events gets past the checks;
every button and the ping form check again, since a card can sit open.

Flows
-----
* **Raid: Close / Raid: Open** — close or reopen sign-ups; the card says
  where they stand and offers the opposite ([Reopen sign-ups] / [Close
  sign-ups], type 7 in place).  A closed raid stays ``scheduled``: the post
  greys out and its buttons, all but [My sign-up], stop working.  The post
  is re-rendered over REST in the background — even when doing it twice
  changes nothing (and says so), which brings a stale post back in line.
* **Raid: Signed** — everyone on the raid, column by column, with
  [Ping signed members]: a form (type 9) prefilled with a reminder.  Its
  submit claims the raid's ping slot under the row lock (one ping per raid
  every few minutes), answers "Pinging N people…" (type 7) and posts in the
  background (``raid_ping``) — a reply to the raid post mentioning seats,
  queue, tentative and bench (not absences); the card then shows the outcome.  A ping that
  can't go out (empty message, nobody listed, too soon) shows the list
  again with the reason.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_ping, raid_publisher
from app.services.discord.interaction import (
    Interaction,
    ephemeral_data,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import RaidContext, load_event, load_target, may_lead, utcnow
from app.services.discord.raid_leader_views import (
    PING_FIELD,
    PING_MAX_CHARS,
    closed_card,
    ping_modal,
    signed_data,
)
from app.services.discord.raid_notifications import build_ping
from app.services.discord.raid_views import unix
from app.services.wow import raid_event_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_roster import listed_user_ids
from app.services.wow.raid_text import display_title, escape_markdown, escape_name

# (closing?, did it change?) → what the card says.
_TOGGLE_TEXT: Final[dict[tuple[bool, bool], str]] = {
    (True, True): raid_copy.CLOSED_OK,
    (True, False): raid_copy.ALREADY_CLOSED,
    (False, True): raid_copy.OPENED_OK,
    (False, False): raid_copy.ALREADY_OPEN,
}


# ---------------------------------------------------------------------------
# Menu commands
# ---------------------------------------------------------------------------


async def handle_close_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    return await _toggle_from_menu(interaction, background, closed=True)


async def handle_open_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    return await _toggle_from_menu(interaction, background, closed=False)


async def handle_signed_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    async with unit_of_work() as db:
        found = await _led_post(db, interaction, lock=False)
        if isinstance(found, str):
            return ephemeral_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, found.event.id)
        return message_response(signed_data(found.event, signups, emojis=emojis.current()))


async def _toggle_from_menu(interaction: Interaction, background: BackgroundTasks, *, closed: bool) -> dict[str, Any]:
    async with unit_of_work() as db:
        found = await _led_post(db, interaction, lock=True)
        if isinstance(found, str):
            return ephemeral_response(found)
        card, refresh = await _toggle(db, found.event, closed=closed)
        event_id = found.event.id
    if refresh:
        background.add_task(raid_publisher.refresh_public_message, event_id)
    return message_response(card)


async def _led_post(db: AsyncSession, interaction: Interaction, *, lock: bool) -> RaidContext | str:
    """The raid whose post the menu was used on, if this member leads it; else why not."""
    if interaction.guild_id is None:
        return raid_copy.GUILD_ONLY
    context = await load_target(db, interaction, lock=lock)
    if context is None:
        return raid_copy.NOT_A_RAID
    if not may_lead(interaction, context.event):
        return raid_copy.NOT_LEADER
    return context


# ---------------------------------------------------------------------------
# Buttons on the cards ([Close sign-ups] / [Reopen sign-ups] / [Ping signed members])
# ---------------------------------------------------------------------------


async def handle_leader_button(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    if parsed.args[0] == "ping":
        return await _open_ping_form(interaction, parsed.event_id)
    async with unit_of_work() as db:
        found = await _led_event(db, interaction, parsed.event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        card, refresh = await _toggle(db, found.event, closed=parsed.args[0] == "close")
    if refresh:
        background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    return update_response(card)


async def _open_ping_form(interaction: Interaction, event_id: uuid.UUID) -> dict[str, Any]:
    """The ping form, unless it couldn't go out — then the list again, saying why."""
    async with unit_of_work() as db:
        found = await _led_event(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        notice = None
        if not listed_user_ids(signups):
            notice = raid_copy.PING_NOBODY
        elif not raid_event_service.ping_ready(found.event, utcnow()):
            notice = raid_copy.PING_WAIT
        if notice is not None:
            return update_response(signed_data(found.event, signups, emojis=emojis.current(), notice=notice))
        return ping_modal(found.event)


async def _led_event(
    db: AsyncSession, interaction: Interaction, event_id: uuid.UUID, *, lock: bool
) -> RaidContext | str:
    """A scheduled raid this member leads; else why not."""
    context = await load_event(db, interaction, event_id, lock=lock)
    if context is None:
        return raid_copy.NOT_FOUND
    if not may_lead(interaction, context.event):
        return raid_copy.NOT_LEADER
    return context


async def _toggle(db: AsyncSession, event: WowRaidEvent, *, closed: bool) -> tuple[dict[str, Any], bool]:
    """Close or reopen sign-ups: the card to show, and whether to re-render the post.

    The post is re-rendered even when nothing changed, so asking again
    fixes a post that missed an update (two quick flips can land out of order).
    """
    now = utcnow()
    if event.status == "cancelled":
        return ephemeral_data(raid_copy.ALREADY_CANCELLED), False
    if event.status != "scheduled" or event.starts_at <= now:
        return ephemeral_data(raid_copy.RAID_STARTED), False
    changed = await raid_event_service.set_signups_closed(db, event, closed=closed, now=now)
    return closed_card(event, _TOGGLE_TEXT[(closed, changed)]), True


# ---------------------------------------------------------------------------
# The ping form's submit
# ---------------------------------------------------------------------------


async def handle_ping_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    text = interaction.fields.get(PING_FIELD, "").strip()[:PING_MAX_CHARS]
    async with unit_of_work() as db:
        found = await _led_event(db, interaction, parsed.event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        user_ids = listed_user_ids(signups)
        now = utcnow()
        notice = await _claim_ping(db, event, text=text, user_ids=user_ids, now=now)
        if notice is not None:
            return update_response(signed_data(event, signups, emojis=emojis.current(), notice=notice))
        job = raid_ping.PingJob(
            event_id=event.id,
            channel_id=event.channel_id,
            post_id=event.message_id,
            messages=build_ping(text, _signature(event, interaction), user_ids),
            application_id=interaction.application_id,
            token=interaction.token,
            claimed_at=now,
        )
    background.add_task(raid_ping.send_ping, job)
    return update_text_response(raid_copy.pinging(len(user_ids)))


async def _claim_ping(
    db: AsyncSession, event: WowRaidEvent, *, text: str, user_ids: list[str], now: datetime
) -> str | None:
    """Why the ping can't go out; None once its slot is claimed (the row lock is held)."""
    if not text:
        return raid_copy.PING_EMPTY
    if not user_ids:
        return raid_copy.PING_NOBODY
    if not await raid_event_service.claim_ping(db, event, now=now):
        return raid_copy.PING_WAIT
    return None


def _signature(event: WowRaidEvent, interaction: Interaction) -> str:
    return raid_copy.ping_signature(
        escape_markdown(display_title(event)), unix(event.starts_at), escape_name(interaction.display_name)
    )
