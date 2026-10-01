"""Discord interaction dispatcher for MyGamingAssistant.

Routes APPLICATION_COMMAND and APPLICATION_COMMAND_AUTOCOMPLETE payloads by
command name, and MESSAGE_COMPONENT payloads by ``custom_id`` prefix.
Handlers receive a parsed :class:`Interaction` plus FastAPI
``BackgroundTasks`` for work that must happen after the 3-second response
(outbound Discord REST calls).

Command registry
----------------
Add a new top-level command:
  1. Write a handler in ``app/services/discord/commands/<name>.py``
     with signature ``async def handle_<name>(interaction, background) -> dict``.
  2. Add ``"<name>": handle_<name>`` to ``_COMMAND_HANDLERS`` (and to
     ``_AUTOCOMPLETE_HANDLERS`` if any option sets ``autocomplete``).
  3. Add the command definition to ``app/services/discord/commands_spec.py``.
  4. Re-register: ``python -m app.cli discord-register-commands``.

Component handler registry
---------------------------
Register ``"<custom_id_prefix>": handler`` in ``_COMPONENT_HANDLERS``; the
dispatcher picks the longest matching prefix.
"""
import logging
from typing import Any

from fastapi import BackgroundTasks

from app.services.discord.autocomplete.raid_admin import handle_raid_admin_autocomplete
from app.services.discord.commands.raid import handle_raid
from app.services.discord.commands.raid_admin import handle_raid_admin
from app.services.discord.components.raid import handle_raid_component
from app.services.discord.interaction import Interaction, autocomplete_response, ephemeral_response
from app.services.wow.raid_custom_id import PREFIX as RAID_CUSTOM_ID_PREFIX

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registries
# ---------------------------------------------------------------------------

# Slash-command name → async handler(interaction, background).
_COMMAND_HANDLERS: dict[str, Any] = {
    "raid": handle_raid,
    "raid-admin": handle_raid_admin,
}

# Slash-command name → async handler(interaction) returning choices.
_AUTOCOMPLETE_HANDLERS: dict[str, Any] = {
    "raid-admin": handle_raid_admin_autocomplete,
}

# custom_id prefix → async handler(interaction, background).
_COMPONENT_HANDLERS: dict[str, Any] = {
    RAID_CUSTOM_ID_PREFIX: handle_raid_component,
}


# ---------------------------------------------------------------------------
# Public dispatch functions
# ---------------------------------------------------------------------------


async def dispatch_application_command(
    payload: dict[str, Any], background: BackgroundTasks
) -> dict[str, Any]:
    """Route an APPLICATION_COMMAND interaction to its handler.

    Returns an ephemeral "Unknown command" response when no handler is
    registered — Discord always shows something, never a timeout.
    """
    command_name: str = payload.get("data", {}).get("name", "")
    handler = _COMMAND_HANDLERS.get(command_name)
    if handler is None:
        logger.warning("Discord: received unknown command %r", command_name)
        return ephemeral_response("Unknown command.")
    return await handler(Interaction.from_payload(payload), background)


async def dispatch_autocomplete(payload: dict[str, Any]) -> dict[str, Any]:
    """Route an APPLICATION_COMMAND_AUTOCOMPLETE interaction (no choices if unknown)."""
    command_name: str = payload.get("data", {}).get("name", "")
    handler = _AUTOCOMPLETE_HANDLERS.get(command_name)
    if handler is None:
        return autocomplete_response([])
    return await handler(Interaction.from_payload(payload))


async def dispatch_message_component(
    payload: dict[str, Any], background: BackgroundTasks
) -> dict[str, Any]:
    """Route a MESSAGE_COMPONENT interaction by longest matching custom_id prefix."""
    data = payload.get("data")
    custom_id = ""
    if isinstance(data, dict) and isinstance(data.get("custom_id"), str):
        custom_id = data["custom_id"]
    best_prefix = ""
    best_handler = None
    for prefix, handler in _COMPONENT_HANDLERS.items():
        if custom_id.startswith(prefix) and len(prefix) > len(best_prefix):
            best_prefix = prefix
            best_handler = handler

    if best_handler is None:
        logger.warning("Discord: received unknown component custom_id %r", custom_id)
        return ephemeral_response("Unknown component.")
    return await best_handler(Interaction.from_payload(payload), background)
