"""Discord slash-command definitions for MyGamingAssistant.

These are the payload shapes sent to the Discord API via
``DiscordRestClient.bulk_overwrite_global_commands`` or
``bulk_overwrite_guild_commands``.  Each command is a plain dict that
mirrors the Discord Application Command structure:

  https://discord.com/developers/docs/interactions/application-commands#application-command-object

Design invariants
-----------------
* ``dm_permission: false`` + ``contexts: [0]`` — all commands are
  guild-only; no DM use.
* ``default_member_permissions`` is deliberately ABSENT at the top-level
  command so every member can use the menu.  Individual subcommands that
  need operator-only access will add it in later PRs (e.g. ``/raid setup``,
  ``/raid cancel``).
* Subcommands are objects with ``type: 1`` (SUB_COMMAND) under ``options``.
  Adding a new subcommand = append to the ``options`` list and add a handler
  in ``app/services/discord/commands/raid.py``.
"""
from typing import Any, Final

# ---------------------------------------------------------------------------
# /raid
# ---------------------------------------------------------------------------

RAID_COMMAND: Final[dict[str, Any]] = {
    "name": "raid",
    "description": "Manage raid signups for your group",
    # CHAT_INPUT (slash command)
    "type": 1,
    # Guild-only: never invoke from DMs or non-guild contexts.
    "dm_permission": False,
    # contexts=[0] restricts to GUILD (contexts type added in Discord API v10).
    "contexts": [0],
    "options": [
        {
            # SUB_COMMAND
            "type": 1,
            "name": "ping",
            "description": "Check the raid bot is alive",
            # No default_member_permissions — open to all guild members.
        },
        # Future subcommands: setup, create, cancel, list.
        # Each needs a handler in app/services/discord/commands/raid.py
        # and an entry in dispatcher._COMMAND_HANDLERS["raid"].
    ],
}

# ---------------------------------------------------------------------------
# Full command list — passed verbatim to bulk_overwrite_*_commands
# ---------------------------------------------------------------------------

ALL_COMMANDS: Final[list[dict[str, Any]]] = [RAID_COMMAND]
