"""Discord interaction dispatcher for MyGamingAssistant.

Routes APPLICATION_COMMAND payloads to per-command handler functions and
MESSAGE_COMPONENT payloads to component handlers keyed by ``custom_id``
prefix.

Command registry
----------------
Add a new top-level command:
  1. Write a handler module in ``app/services/discord/commands/<name>.py``
     that exports ``async def handle_<name>(payload) -> dict``.
  2. Import it here and add ``"<name>": handle_<name>`` to ``_COMMAND_HANDLERS``.
  3. Add the command definition to ``app/services/discord/commands_spec.py``.
  4. Re-register: ``python -m app.cli discord-register-commands``.

Component handler registry
---------------------------
Add a component handler (buttons, selects):
  1. Register ``"<custom_id_prefix>": async_handler`` in ``_COMPONENT_HANDLERS``
     (the dispatcher finds the longest matching prefix).
  2. Handlers receive the full interaction payload and return a response dict.
"""
import logging
from typing import Any

from platform_shared.services.discord import (
    CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
    MESSAGE_FLAG_EPHEMERAL,
)

from app.services.discord.commands.raid import handle_raid

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registries
# ---------------------------------------------------------------------------

# Maps slash-command name → async handler coroutine.
_COMMAND_HANDLERS: dict[str, Any] = {
    "raid": handle_raid,
}

# Maps custom_id prefix → async handler coroutine.
# Dispatcher uses longest-prefix matching so "raid:confirm:" beats "raid:".
_COMPONENT_HANDLERS: dict[str, Any] = {
    # Future: "raid:signup:" → handle_raid_signup_component,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ephemeral(content: str) -> dict[str, Any]:
    return {
        "type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
        "data": {
            "content": content,
            "flags": MESSAGE_FLAG_EPHEMERAL,
        },
    }


# ---------------------------------------------------------------------------
# Public dispatch functions
# ---------------------------------------------------------------------------


async def dispatch_application_command(payload: dict[str, Any]) -> dict[str, Any]:
    """Route an APPLICATION_COMMAND interaction to its handler.

    Returns an ephemeral "Unknown command" response when no handler is
    registered — Discord always shows something, never a timeout.

    Args:
        payload: Verified interaction payload (type == INTERACTION_TYPE_APPLICATION_COMMAND).

    Returns:
        A Discord interaction response dict.
    """
    command_name: str = payload.get("data", {}).get("name", "")
    handler = _COMMAND_HANDLERS.get(command_name)
    if handler is None:
        logger.warning("Discord: received unknown command %r", command_name)
        return _ephemeral("Unknown command.")
    return await handler(payload)


async def dispatch_message_component(payload: dict[str, Any]) -> dict[str, Any]:
    """Route a MESSAGE_COMPONENT interaction to its handler by custom_id prefix.

    Uses longest-prefix matching so a more-specific prefix takes precedence
    over a broader one (e.g. ``"raid:confirm:"`` wins over ``"raid:"``).

    Returns ephemeral "Unknown component" when no prefix matches.

    Args:
        payload: Verified interaction payload (type == INTERACTION_TYPE_MESSAGE_COMPONENT).

    Returns:
        A Discord interaction response dict.
    """
    custom_id: str = payload.get("data", {}).get("custom_id", "")
    # Longest matching prefix wins.
    best_prefix = ""
    best_handler = None
    for prefix, handler in _COMPONENT_HANDLERS.items():
        if custom_id.startswith(prefix) and len(prefix) > len(best_prefix):
            best_prefix = prefix
            best_handler = handler

    if best_handler is None:
        logger.warning("Discord: received unknown component custom_id %r", custom_id)
        return _ephemeral("Unknown component.")
    return await best_handler(payload)
