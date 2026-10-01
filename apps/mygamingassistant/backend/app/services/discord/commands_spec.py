"""Discord slash-command definitions for MyGamingAssistant.

These are the payload shapes sent to the Discord API via
``DiscordRestClient.bulk_overwrite_global_commands`` or
``bulk_overwrite_guild_commands``:

  https://discord.com/developers/docs/interactions/application-commands#application-command-object

Two top-level commands
----------------------
``default_member_permissions`` applies per top-level command, never per
subcommand, so the raid bot is split:

* ``/raid`` — everyone: ``list``, ``prefs`` (and ``ping``).
* ``/raid-admin`` — organisers: ``setup``, ``create``, ``edit``, ``cancel``.
  ``default_member_permissions`` = Manage Events, so regular members never
  see organiser actions in their slash menu.  Server admins can still widen
  or narrow access per command in Server Settings → Integrations.

The client-side gate is advisory: handlers re-check the member's permission
bitfield from the payload (Manage Events; Manage Server for ``setup``).

Design invariants
-----------------
* ``dm_permission: false`` + ``contexts: [0]`` — guild-only.
* Every choice list / min / max here is re-validated server-side.
"""
from typing import Any, Final

from platform_shared.services.discord import MANAGE_EVENTS

from app.services.wow.raid_catalog import CLASSES, RAIDS, ROLE_LABELS, ROLE_ORDER

# Application command option types
_SUB_COMMAND: Final = 1
_STRING: Final = 3
_INTEGER: Final = 4
_BOOLEAN: Final = 5
_CHANNEL: Final = 7
_ROLE: Final = 8

# Channel types a raid can be posted into: GUILD_TEXT, GUILD_ANNOUNCEMENT.
_POSTABLE_CHANNEL_TYPES: Final = [0, 5]

_RAID_CHOICES: Final = [{"name": raid.choice_label, "value": raid.key} for raid in RAIDS]
_CLASS_CHOICES: Final = [{"name": cls.label, "value": cls.key} for cls in CLASSES]
_ROLE_CHOICES: Final = [{"name": ROLE_LABELS[role], "value": role} for role in ROLE_ORDER]

_WHEN_DESCRIPTION: Final = "When it starts, in the server's timezone (e.g. sat 8pm, 10/14 8:00pm)"


def _event_option(description: str) -> dict[str, Any]:
    return {
        "type": _STRING,
        "name": "event",
        "description": description,
        "required": True,
        "autocomplete": True,
    }


# ---------------------------------------------------------------------------
# /raid — everyone
# ---------------------------------------------------------------------------

RAID_COMMAND: Final[dict[str, Any]] = {
    "name": "raid",
    "description": "Raid signups for your group",
    "type": 1,  # CHAT_INPUT
    "dm_permission": False,
    "contexts": [0],
    "options": [
        {"type": _SUB_COMMAND, "name": "ping", "description": "Check the raid bot is alive"},
        {"type": _SUB_COMMAND, "name": "list", "description": "Show upcoming raids"},
        {
            "type": _SUB_COMMAND,
            "name": "prefs",
            "description": "Your class, role and reminder settings",
            "options": [
                {
                    "type": _STRING,
                    "name": "class",
                    "description": "The class you usually bring",
                    "choices": _CLASS_CHOICES,
                },
                {
                    "type": _STRING,
                    "name": "role",
                    "description": "The role you usually play",
                    "choices": _ROLE_CHOICES,
                },
                {
                    "type": _BOOLEAN,
                    "name": "dm_reminders",
                    "description": "Get raid reminders by DM",
                },
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# /raid-admin — organisers (Manage Events by default)
# ---------------------------------------------------------------------------

RAID_ADMIN_COMMAND: Final[dict[str, Any]] = {
    "name": "raid-admin",
    "description": "Schedule and manage raids",
    "type": 1,
    "dm_permission": False,
    "contexts": [0],
    # Bitfield as a decimal string (Discord's format).
    "default_member_permissions": str(MANAGE_EVENTS),
    "options": [
        {
            "type": _SUB_COMMAND,
            "name": "setup",
            "description": "Choose where raids are posted and the server's timezone",
            "options": [
                {
                    "type": _CHANNEL,
                    "name": "channel",
                    "description": "Channel for raid posts",
                    "required": True,
                    "channel_types": _POSTABLE_CHANNEL_TYPES,
                },
                {
                    "type": _STRING,
                    "name": "timezone",
                    "description": "Timezone for raid times (e.g. Eastern, America/New_York)",
                    "required": True,
                    "autocomplete": True,
                },
                {
                    "type": _ROLE,
                    "name": "ping_role",
                    "description": "Role to ping when a raid is posted",
                },
            ],
        },
        {
            "type": _SUB_COMMAND,
            "name": "create",
            "description": "Schedule a raid and post a signup",
            "options": [
                {
                    "type": _STRING,
                    "name": "raid",
                    "description": "Which raid",
                    "required": True,
                    "choices": _RAID_CHOICES,
                },
                {
                    "type": _STRING,
                    "name": "when",
                    "description": _WHEN_DESCRIPTION,
                    "required": True,
                    "max_length": 60,
                },
                {
                    "type": _INTEGER,
                    "name": "size",
                    "description": "Raid size (defaults to the raid's normal size)",
                    "min_value": 5,
                    "max_value": 40,
                },
                {
                    "type": _STRING,
                    "name": "notes",
                    "description": "Shown on the signup post",
                    "max_length": 200,
                },
            ],
        },
        {
            "type": _SUB_COMMAND,
            "name": "edit",
            "description": "Change a raid's time, size or notes",
            "options": [
                _event_option("Which raid to edit"),
                {"type": _STRING, "name": "when", "description": _WHEN_DESCRIPTION, "max_length": 60},
                {
                    "type": _INTEGER,
                    "name": "size",
                    "description": "New raid size",
                    "min_value": 5,
                    "max_value": 40,
                },
                {"type": _STRING, "name": "notes", "description": "New notes", "max_length": 200},
            ],
        },
        {
            "type": _SUB_COMMAND,
            "name": "cancel",
            "description": "Cancel a raid and tell everyone signed up",
            "options": [
                _event_option("Which raid to cancel"),
                {"type": _STRING, "name": "reason", "description": "Why (shown to players)", "max_length": 200},
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# Full command list — passed verbatim to bulk_overwrite_*_commands
# ---------------------------------------------------------------------------

ALL_COMMANDS: Final[list[dict[str, Any]]] = [RAID_COMMAND, RAID_ADMIN_COMMAND]
