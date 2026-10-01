"""/raid slash-command handler for the MGA Discord bot.

Current subcommands
-------------------
  ping    — health check; always responds with a public "alive" message.

Future subcommands (separate PRs)
----------------------------------
  setup   — configure the raid-signup channel and roles for this guild.
  create  — open a new raid event (name, date/time, roster size, notes).
  cancel  — cancel an open event (operator-only via default_member_permissions).
  list    — show upcoming events in this guild.

Extending
---------
Add a branch in ``handle_raid`` below, add the subcommand to
``app/services/discord/commands_spec.py``, and register the command again
via ``python -m app.cli discord-register-commands``.
"""
from typing import Any

from platform_shared.services.discord import (
    CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
    MESSAGE_FLAG_EPHEMERAL,
)


def _ephemeral(content: str) -> dict[str, Any]:
    """Return an ephemeral channel message (only visible to the invoking user)."""
    return {
        "type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
        "data": {
            "content": content,
            "flags": MESSAGE_FLAG_EPHEMERAL,
        },
    }


async def handle_raid(payload: dict[str, Any]) -> dict[str, Any]:
    """Dispatch /raid APPLICATION_COMMAND interactions by subcommand name.

    Returns a valid Discord interaction callback dict.  The response MUST be
    returned within 3 seconds; this handler makes no outbound calls so it is
    well within budget.

    Args:
        payload: The verified interaction payload from Discord.

    Returns:
        A Discord interaction response dict (``{"type": ..., "data": ...}``).
    """
    options: list[dict[str, Any]] = payload.get("data", {}).get("options", [])
    subcommand: str = options[0].get("name", "") if options else ""

    if subcommand == "ping":
        return {
            "type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
            "data": {"content": "Raid bot is alive and ready!"},
        }

    # Subcommand recognised by Discord (it's in commands_spec) but not yet
    # handled here → tell the user cleanly rather than returning a 500.
    return _ephemeral(f"The /{payload.get('data', {}).get('name', 'raid')} {subcommand} subcommand is not implemented yet.")
