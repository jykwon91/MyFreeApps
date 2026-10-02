"""Discord interaction dispatcher for MyGamingAssistant.

Routes APPLICATION_COMMAND and APPLICATION_COMMAND_AUTOCOMPLETE payloads by
command name, and MESSAGE_COMPONENT and MODAL_SUBMIT payloads by
``custom_id`` prefix.  Handlers receive a parsed :class:`Interaction` plus
FastAPI ``BackgroundTasks`` for work that must happen after the 3-second
response (outbound Discord REST calls).

Command registry
----------------
Add a new top-level command:
  1. Write a handler in ``app/services/discord/commands/<name>.py``
     with signature ``async def handle_<name>(interaction, background) -> dict``.
  2. Add ``"<name>": handle_<name>`` to ``_COMMAND_HANDLERS`` (and to
     ``_AUTOCOMPLETE_HANDLERS`` if any option sets ``autocomplete``).
  3. Add the command definition to ``app/services/discord/commands_spec.py``.
  4. Re-register: ``python -m app.cli discord-register-commands``.

Right-click (message) commands go in ``_COMMAND_HANDLERS`` too, keyed by
the name the menu shows ("Raid: Close").

Component and modal registries
------------------------------
Register ``"<custom_id_prefix>": handler`` in ``_COMPONENT_HANDLERS`` (buttons,
select menus) or ``_MODAL_HANDLERS`` (a modal's submit); the dispatcher picks
the longest matching prefix.
"""
import logging
from typing import Any

from fastapi import BackgroundTasks

from app.services.discord.autocomplete.raid import handle_raid_autocomplete
from app.services.discord.autocomplete.raid_admin import handle_raid_admin_autocomplete
from app.services.discord.commands.raid import handle_raid
from app.services.discord.commands.raid_admin import handle_raid_admin
from app.services.discord.commands_spec import CLOSE_MENU, EDIT_MENU, OPEN_MENU, SIGNED_MENU
from app.services.discord.components.raid import handle_raid_component, handle_raid_modal
from app.services.discord.components.raid_edit import handle_edit_menu
from app.services.discord.components.raid_leader import handle_close_menu, handle_open_menu, handle_signed_menu
from app.services.discord.interaction import Interaction, autocomplete_response, ephemeral_response
from app.services.wow.raid_custom_id import PREFIX as RAID_CUSTOM_ID_PREFIX

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registries
# ---------------------------------------------------------------------------

# Command name (slash, or right-click menu) → async handler(interaction, background).
_COMMAND_HANDLERS: dict[str, Any] = {
    "raid": handle_raid,
    "raid-admin": handle_raid_admin,
    EDIT_MENU: handle_edit_menu,
    CLOSE_MENU: handle_close_menu,
    OPEN_MENU: handle_open_menu,
    SIGNED_MENU: handle_signed_menu,
}

# Slash-command name → async handler(interaction) returning choices.
_AUTOCOMPLETE_HANDLERS: dict[str, Any] = {
    "raid": handle_raid_autocomplete,
    "raid-admin": handle_raid_admin_autocomplete,
}

# custom_id prefix → async handler(interaction, background).
_COMPONENT_HANDLERS: dict[str, Any] = {
    RAID_CUSTOM_ID_PREFIX: handle_raid_component,
}

# A modal's custom_id prefix → async handler(interaction, background).
_MODAL_HANDLERS: dict[str, Any] = {
    RAID_CUSTOM_ID_PREFIX: handle_raid_modal,
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
    custom_id = _custom_id(payload)
    handler = _longest_prefix(_COMPONENT_HANDLERS, custom_id)
    if handler is None:
        logger.warning("Discord: received unknown component custom_id %r", custom_id)
        return ephemeral_response("Unknown component.")
    return await handler(Interaction.from_payload(payload), background)


async def dispatch_modal_submit(
    payload: dict[str, Any], background: BackgroundTasks
) -> dict[str, Any]:
    """Route a MODAL_SUBMIT interaction by longest matching custom_id prefix."""
    custom_id = _custom_id(payload)
    handler = _longest_prefix(_MODAL_HANDLERS, custom_id)
    if handler is None:
        logger.warning("Discord: received unknown modal custom_id %r", custom_id)
        return ephemeral_response("Unknown form.")
    return await handler(Interaction.from_payload(payload), background)


def _custom_id(payload: dict[str, Any]) -> str:
    data = payload.get("data")
    if isinstance(data, dict) and isinstance(data.get("custom_id"), str):
        return data["custom_id"]
    return ""


def _longest_prefix(handlers: dict[str, Any], custom_id: str) -> Any:
    """The handler whose prefix is the longest one ``custom_id`` starts with."""
    best_prefix = ""
    best_handler = None
    for prefix, handler in handlers.items():
        if custom_id.startswith(prefix) and len(prefix) > len(best_prefix):
            best_prefix = prefix
            best_handler = handler
    return best_handler
