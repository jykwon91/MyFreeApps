"""Router for every ``raid:v1:`` component interaction and modal submit.

Parses the custom_id defensively (``raid_custom_id.parse``); anything
malformed or unknown gets the generic private error — never a 500.  A
modal's submit carries ``raid:v1:m:<event>:<modal>`` and is routed by the
modal's name.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Final

from fastapi import BackgroundTasks

from app.services.discord import raid_copy, raid_publisher
from app.services.discord.components import (
    raid_admin,
    raid_card,
    raid_edit,
    raid_leader,
    raid_manage,
    raid_seat,
    raid_signup,
)
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
    "cls": raid_signup.handle_class_button,
    "signup": raid_signup.handle_signup,
    "status": raid_signup.handle_status,
    "class": raid_signup.handle_class_pick,
    "spec": raid_signup.handle_spec_pick,
    "pickclass": raid_signup.handle_pick_class,
    "role": raid_signup.handle_role_pick,
    "mine": raid_card.handle_mine,
    "card": raid_card.handle_card,
    "change": raid_card.handle_change,
    "roster": raid_card.handle_roster,
    "release": raid_seat.handle_release,
    "stay": raid_seat.handle_stay,
    "confirm": raid_admin.handle_confirm,
    "discard": raid_admin.handle_discard,
    "cancel": raid_admin.handle_cancel,
    "keep": raid_admin.handle_keep,
    "lc": raid_leader.handle_leader_button,
    "ed": raid_edit.handle_edit_button,
    "pick": raid_edit.handle_pick,
    "del": raid_edit.handle_delete,
    "ml": raid_manage.handle_manage,
    "testdm": _handle_test_dm,
}

# A modal's name (the last part of its ``m`` custom_id) → its submit handler.
_MODAL_HANDLERS: Final[dict[str, ComponentHandler]] = {
    "ping": raid_leader.handle_ping_submit,
    "title": raid_edit.handle_title_submit,
    "when": raid_edit.handle_when_submit,
    "desc": raid_edit.handle_description_submit,
    "image": raid_edit.handle_image_submit,
    "cancel": raid_edit.handle_cancel_submit,
    "role_limits": raid_edit.handle_role_limits_submit,
    "class_limits": raid_edit.handle_class_limits_submit,
}


async def handle_raid_component(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    parsed = raid_custom_id.parse(interaction.custom_id)
    if parsed is None:
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    if interaction.guild_id is None:
        return ephemeral_response(raid_copy.GUILD_ONLY)
    handler = _HANDLERS.get(parsed.action)
    if handler is None:
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    return await handler(interaction, parsed, background)


async def handle_raid_modal(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    parsed = raid_custom_id.parse(interaction.custom_id)
    if parsed is None or parsed.action != "m":
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    if interaction.guild_id is None:
        return ephemeral_response(raid_copy.GUILD_ONLY)
    handler = _MODAL_HANDLERS.get(parsed.args[0])
    if handler is None:
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    return await handler(interaction, parsed, background)
