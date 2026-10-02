"""More options / Raid: Edit → [Event & thread] — the raid's Discord event and thread.

The card (``raid_extras_views.extras_card``) says where each stands and
switches it; [Length] opens a form.  Every answer replaces the card (type 7),
apart from the form (type 9).

* On a draft a toggle only writes the leader's choice: [Post raid] makes them.
* On a posted raid the choice is written under the raid's row lock and the
  card comes back busy (every button off); :func:`update_card` makes the
  Discord calls in the background, then edits the card with how they went
  (``GONE`` when the raid has moved on meanwhile).  A Length change on a raid
  with a Discord event moves the event's end the same way.

Its leader, or anyone with Manage Events (``load_led_event``), on a draft or
a raid still to come.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import DiscordRestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord import raid_extras, raid_extras_copy, raid_publisher, rest
from app.services.discord.interaction import Interaction, ephemeral_data, update_response, update_text_response
from app.services.discord.raid_context import load_led_event, utcnow
from app.services.discord.raid_extras_views import extras_card, length_modal
from app.services.discord.raid_forms import FIELD
from app.services.wow import raid_extras_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_extras_rules import Step, Synced
from app.services.wow.raid_extras_service import LengthSaved

logger = logging.getLogger(__name__)

# The raids whose extras can change: a draft, or a raid still to come.
_OPEN: Final = ("draft", "scheduled")
# The verbs that write, under the raid's row lock.
_LOCKED: Final = ("event_on", "event_off", "thread_on", "thread_off", "retry")


async def handle_extras(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Event & thread], and the card's toggles, [Length] and [Try again]."""
    assert parsed.event_id is not None
    verb = parsed.args[0]
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=verb in _LOCKED, statuses=_OPEN)
        if isinstance(found, str):
            return update_text_response(found)
        event, guild = found.event, found.guild
        if verb == "length":
            return length_modal(event)
        if verb == "open":
            return update_response(extras_card(event, guild, now=utcnow()))
        await raid_extras_service.apply(db, event, verb)
        if event.status == "draft":
            notice = raid_extras_copy.draft_notice(verb)
            return update_response(extras_card(event, guild, now=utcnow(), notice=notice))
        card = extras_card(event, guild, now=utcnow(), notice=raid_extras_copy.BUSY[verb], busy=True)
    background.add_task(update_card, parsed.event_id, verb, interaction.application_id, interaction.token)
    return update_response(card)


async def handle_length_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The Length form: how long the raid runs, and so when its Discord event ends."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_OPEN)
        if isinstance(found, str):
            return update_text_response(found)
        event, guild = found.event, found.guild
        saved = await raid_extras_service.set_length(db, event, interaction.fields.get(FIELD, ""))
        if not saved.changed or event.discord_event_id is None:
            notice = raid_extras_copy.length_notice(saved)
            return update_response(extras_card(event, guild, now=utcnow(), notice=notice))
        card = extras_card(event, guild, now=utcnow(), notice=raid_extras_copy.BUSY["length"], busy=True)
    background.add_task(update_card, parsed.event_id, "length", interaction.application_id, interaction.token)
    return update_response(card)


async def update_card(event_id: uuid.UUID, verb: str, application_id: str, token: str) -> None:
    """The background half of a toggle, [Try again] or a Length change on a posted raid.

    Makes the Discord calls *verb* asks for, then edits the card with how they
    went.  Never raises.
    """
    try:
        async with rest.make_rest_client() as client:
            outcome = await _calls(client, event_id, verb)
            async with unit_of_work() as db:
                data = await _card_after(db, event_id, verb, outcome)
            await raid_publisher.edit_original(client, application_id, token, data)
    except Exception:
        logger.exception("Raid bot: updating raid %s's Event & thread card failed", event_id)


async def _calls(client: DiscordRestClient, event_id: uuid.UUID, verb: str) -> Step | Synced:
    """[Discord event: on] → off removes the event, [Thread: on] → off archives the thread; the rest sync."""
    if verb == "event_off":
        return await raid_extras.remove_event(client, event_id)
    if verb == "thread_off":
        return await raid_extras.archive_thread(client, event_id)
    return await raid_extras.sync(client, event_id, reopen_thread=verb == "thread_on")


async def _card_after(db: AsyncSession, event_id: uuid.UUID, verb: str, outcome: Step | Synced) -> dict[str, Any]:
    """The card as the raid is now, led by what happened; ``GONE`` when the raid has moved on."""
    event = await wow_raid_event_repo.get(db, event_id)
    if event is None or event.status not in _OPEN:
        return ephemeral_data(raid_extras_copy.GONE, embeds=[])
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    if guild is None:
        return ephemeral_data(raid_extras_copy.GONE, embeds=[])
    return extras_card(event, guild, now=utcnow(), notice=_notice(verb, outcome, event))


def _notice(verb: str, outcome: Step | Synced, event: WowRaidEvent) -> str | None:
    """What the card leads with: a toggle off's outcome, or what the sync did (a Length change says the length)."""
    if isinstance(outcome, Step):
        return raid_extras_copy.off_notice(verb, outcome, event.channel_id)
    said = raid_extras_copy.sync_notice(verb, outcome)
    if verb != "length":
        return said
    length = raid_extras_copy.length_notice(LengthSaved("set", event.length_minutes))
    return "\n".join(line for line in (length, said) if line)
