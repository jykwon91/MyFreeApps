"""Discord command definitions for MyGamingAssistant — slash commands and the
raid post's right-click menu.

These are the payload shapes sent to the Discord API via
``overwrite_global_commands_preserving_entry_point`` (global — keeps the
Activity's ``PRIMARY_ENTRY_POINT`` launch command, which is never declared
here) or ``DiscordRestClient.bulk_overwrite_guild_commands``:

  https://discord.com/developers/docs/interactions/application-commands#application-command-object

Two top-level commands
----------------------
``default_member_permissions`` applies per top-level command, never per
subcommand, so the raid bot is split:

* ``/raid`` — everyone: ``list``, ``prefs`` (and ``ping``).
* ``/raid-admin`` — organisers: ``setup``, ``create``, ``edit``, ``cancel``,
  ``signup``, ``repeats``.
  ``default_member_permissions`` = Manage Events, so regular members never
  see organiser actions in their slash menu.  Server admins can still widen
  or narrow access per command in Server Settings → Integrations.

The client-side gate is advisory: handlers re-check the member's permission
bitfield from the payload (Manage Events; Manage Server for ``setup``).

The raid post's right-click menu
--------------------------------
Message commands (right-click a raid post → Apps): ``Raid: Edit``,
``Raid: Close``, ``Raid: Open`` and ``Raid: Signed``, Manage Events by
default like ``/raid-admin``.  Their handlers also let the raid's own
leader in.  Discord allows five message commands per app; ``Raid: Unsigned``
is to take the last, so any further leader action is a button or a slash
command.

The member right-click menu
---------------------------
A user command (right-click a member → Apps): ``Raid: Manage``, the same
default.  It opens Manage sign-ups on that member, like
``/raid-admin signup``.  User commands have their own cap of five.

Design invariants
-----------------
* ``dm_permission: false`` + ``contexts: [0]`` — guild-only.
* Every choice list / min / max here is re-validated server-side.
"""
from typing import Any, Final

from platform_shared.services.discord import COMMAND_TYPE_MESSAGE, COMMAND_TYPE_USER, MANAGE_EVENTS

from app.models.wow.wow_raid_signup import CHARACTER_NAME_MAX
from app.services.wow.raid_catalog import CLASSES, RAIDS

# Application command option types
_SUB_COMMAND: Final = 1
_STRING: Final = 3
_INTEGER: Final = 4
_BOOLEAN: Final = 5
_USER: Final = 6
_CHANNEL: Final = 7
_ROLE: Final = 8

# Channel types a raid can be posted into: GUILD_TEXT, GUILD_ANNOUNCEMENT.
_POSTABLE_CHANNEL_TYPES: Final = [0, 5]

_RAID_CHOICES: Final = [{"name": raid.choice_label, "value": raid.key} for raid in RAIDS]
_CLASS_CHOICES: Final = [{"name": cls.label, "value": cls.key} for cls in CLASSES]

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
            "description": "Your class, spec and reminder settings",
            "options": [
                {
                    "type": _STRING,
                    "name": "class",
                    "description": "The class you usually bring",
                    "choices": _CLASS_CHOICES,
                },
                {
                    "type": _STRING,
                    "name": "spec",
                    "description": "Your spec (fill in class first for a shorter list)",
                    "autocomplete": True,
                    "max_length": 40,
                },
                {
                    "type": _STRING,
                    "name": "character",
                    "description": "Your in-game name for your class (2-12 letters), or - to clear it",
                    "min_length": 1,
                    "max_length": CHARACTER_NAME_MAX,
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
                {
                    "type": _BOOLEAN,
                    "name": "discord_events",
                    "description": "Give new raids a Discord event in the Events tab (the bot needs Create Events)",
                },
                {
                    "type": _BOOLEAN,
                    "name": "threads",
                    "description": (
                        "Give new raids a chat thread under their post (the bot needs Create Public Threads)"
                    ),
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
        {
            "type": _SUB_COMMAND,
            "name": "signup",
            "description": "Add, change or remove a player on a raid",
            "options": [
                _event_option("Which raid"),
                {"type": _USER, "name": "player", "description": "Who to add, change or remove", "required": True},
            ],
        },
        {"type": _SUB_COMMAND, "name": "repeats", "description": "See and change the raids that repeat"},
    ],
}

# ---------------------------------------------------------------------------
# The raid post's right-click menu (message commands)
# ---------------------------------------------------------------------------

EDIT_MENU: Final = "Raid: Edit"
CLOSE_MENU: Final = "Raid: Close"
OPEN_MENU: Final = "Raid: Open"
SIGNED_MENU: Final = "Raid: Signed"


def _message_command(name: str) -> dict[str, Any]:
    """A right-click → Apps entry on messages (no description or options)."""
    return {
        "name": name,
        "type": COMMAND_TYPE_MESSAGE,
        "dm_permission": False,
        "contexts": [0],
        "default_member_permissions": str(MANAGE_EVENTS),
    }


MENU_COMMANDS: Final[list[dict[str, Any]]] = [
    _message_command(name) for name in (EDIT_MENU, CLOSE_MENU, OPEN_MENU, SIGNED_MENU)
]

# ---------------------------------------------------------------------------
# The member right-click menu (user commands)
# ---------------------------------------------------------------------------

MANAGE_MENU: Final = "Raid: Manage"


def _user_command(name: str) -> dict[str, Any]:
    """A right-click → Apps entry on members (no description or options)."""
    return {
        "name": name,
        "type": COMMAND_TYPE_USER,
        "dm_permission": False,
        "contexts": [0],
        "default_member_permissions": str(MANAGE_EVENTS),
    }


USER_COMMANDS: Final[list[dict[str, Any]]] = [_user_command(MANAGE_MENU)]

# ---------------------------------------------------------------------------
# Full command list — passed verbatim to bulk_overwrite_*_commands
# ---------------------------------------------------------------------------

ALL_COMMANDS: Final[list[dict[str, Any]]] = [RAID_COMMAND, RAID_ADMIN_COMMAND, *MENU_COMMANDS, *USER_COMMANDS]
