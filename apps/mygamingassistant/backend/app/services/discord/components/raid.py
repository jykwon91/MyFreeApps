"""Router for every ``raid:v1:`` component interaction.

Parses the custom_id defensively (``raid_custom_id.parse``); anything
malformed or unknown gets the generic private error — never a 500.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Final

from fastapi import BackgroundTasks

from app.services.discord import raid_copy, raid_publisher
from app.services.discord.components import raid_admin, raid_signup
from app.services.discord.interaction import (
    Interaction,
    deferred_ephemeral_response,
    ephemeral_response,
)
from app.services.wow import raid_custom_id
from app.services.wow.raid_custom_id import RaidCustomId

ComponentHandler = Callable[[Interaction, RaidCustomId, BackgroundTasks], Awaitable[dict[str, Any]]]


async def _handle_test_dm(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """[Send me a test DM] — answer 'thinking…' now, report the DM result after."""
    background.add_task(raid_publisher.send_test_dm, interaction.user_id, interaction.application_id, interaction.token)
    return deferred_ephemeral_response()


_HANDLERS: Final[dict[str, ComponentHandler]] = {
    "signup": raid_signup.handle_signup,
    "status": raid_signup.handle_status,
    "class": raid_signup.handle_class_pick,
    "spec": raid_signup.handle_spec_pick,
    "pickclass": raid_signup.handle_pick_class,
    "role": raid_signup.handle_role_pick,
    "mine": raid_signup.handle_mine,
    "change": raid_signup.handle_change,
    "roster": raid_signup.handle_roster,
    "confirm": raid_admin.handle_confirm,
    "discard": raid_admin.handle_discard,
    "cancel": raid_admin.handle_cancel,
    "keep": raid_admin.handle_keep,
    "testdm": _handle_test_dm,
}


async def handle_raid_component(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    parsed = raid_custom_id.parse(interaction.custom_id)
    if parsed is None:
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    if interaction.guild_id is None:
        return ephemeral_response(raid_copy.GUILD_ONLY)
    return await _HANDLERS[parsed.action](interaction, parsed, background)
