"""The private My sign-up card: your status and spec, [Change spec] and [Full roster].

[My sign-up] on the post opens the card.  [Full roster] and [Back] swap it
in place (UPDATE_MESSAGE, type 7).  [Change spec] opens your class's spec
select, which keeps the status you have when you pick (see ``raid_signup``).
[Roster] on posts from before the class buttons opens the roster on its own.
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import load_event
from app.services.discord.raid_views import class_picker_data, my_signup_data, roster_data, spec_picker_data
from app.services.wow.raid_catalog import CLASSES_BY_KEY, spec_info
from app.services.wow.raid_custom_id import SAME_STATUS, RaidCustomId


async def handle_mine(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[My sign-up] on the post — the private card."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        mine = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        return message_response(my_signup_data(context.event, mine, signups, emojis=emojis.current()))


async def handle_card(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Full roster] / [Back] — swap the card in place."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return update_text_response(raid_copy.NOT_FOUND)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        if parsed.args[0] == "roster":
            return update_response(
                roster_data(context.event, signups, context.guild, emojis=emojis.current(), back=True)
            )
        mine = next((s for s in signups if s.discord_user_id == interaction.user_id), None)
        return update_response(my_signup_data(context.event, mine, signups, emojis=emojis.current()))


async def handle_change(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Change spec] — the spec select for your class, keeping the status; [Back] returns."""
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
        current = spec_info(mine.wow_class, mine.spec)
        return update_response(
            spec_picker_data(
                context.event, SAME_STATUS, mine.wow_class, current=current, emojis=emojis.current(), back=True
            )
        )


async def handle_roster(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Roster] on posts from before the class buttons."""
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        context = await load_event(db, interaction, parsed.event_id, lock=False)
        if context is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
        signups = await wow_raid_signup_repo.list_for_event(db, context.event.id)
        return message_response(roster_data(context.event, signups, context.guild, emojis=emojis.current()))
