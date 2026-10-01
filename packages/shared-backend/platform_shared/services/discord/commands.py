"""Global command registration that keeps an app's Activity entry point.

Enabling Activities on a Discord application makes Discord create a
``PRIMARY_ENTRY_POINT`` command for it (``type`` 4, ``handler`` 2 —
``DISCORD_LAUNCH_ACTIVITY``, default name ``launch``). That command is the
"Launch" button in the App Launcher.

``PUT /applications/{id}/commands`` replaces the ENTIRE global command list,
and Discord refuses an overwrite that would delete the entry point (JSON error
code 50240, "You cannot remove this app's Entry Point command in a bulk update
operation"). A deploy step that registers only the app's own slash commands
therefore starts failing the moment someone turns Activities on.

:func:`overwrite_global_commands_preserving_entry_point` is the safe
replacement for a plain bulk overwrite:

1. ``GET`` the currently registered global commands.
2. If a ``PRIMARY_ENTRY_POINT`` command exists — and the caller's list does not
   declare its own — carry it into the overwrite with its fields preserved.
   Its ``id`` is kept: the bulk endpoint accepts ``id`` ("ID of the command, if
   known") and matches on it, so the entry point is updated in place, never
   deleted and recreated. Only response-only metadata is dropped.
3. If none exists, the caller's list is sent unchanged. An entry point is never
   invented here — whether one exists is the Developer Portal's Activities
   toggle's call, not deploy code's.

Guild commands are unaffected: entry-point commands can only be global.
"""
from __future__ import annotations

import logging
from typing import Any, Final

from platform_shared.services.discord.client import DiscordRestClient

logger = logging.getLogger(__name__)

COMMAND_TYPE_PRIMARY_ENTRY_POINT: Final = 4
"""``ApplicationCommandType.PRIMARY_ENTRY_POINT`` — an app's Activity launcher."""

ENTRY_POINT_HANDLER_DISCORD_LAUNCH_ACTIVITY: Final = 2
"""``EntryPointCommandHandlerType.DISCORD_LAUNCH_ACTIVITY`` — Discord opens the Activity itself."""

ENTRY_POINT_REMOVAL_REJECTED: Final = 50240
"""JSON error code Discord returns when a bulk overwrite would remove the entry point."""

# Fields Discord adds to the command objects it RETURNS that are not part of
# the bulk-overwrite request shape. Everything else on a fetched entry point is
# carried verbatim (id, name, description, localizations, contexts,
# integration_types, handler, permissions, nsfw, ...).
_RESPONSE_ONLY_FIELDS: Final = frozenset(
    {
        "application_id",
        "guild_id",
        "version",
        "name_localized",
        "description_localized",
    }
)


def is_entry_point_command(command: dict[str, Any]) -> bool:
    """True when ``command`` is a ``PRIMARY_ENTRY_POINT`` command."""
    return command.get("type") == COMMAND_TYPE_PRIMARY_ENTRY_POINT


def to_overwrite_payload(command: dict[str, Any]) -> dict[str, Any]:
    """Return a fetched command minus response-only metadata (input untouched)."""
    return {
        key: value
        for key, value in command.items()
        if key not in _RESPONSE_ONLY_FIELDS
    }


def entry_points_to_carry(
    desired: list[dict[str, Any]],
    existing: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return the registered entry-point command(s) a global overwrite must keep.

    Empty when the caller's ``desired`` list already declares an entry point
    (the caller owns it — carrying the old one too would mean two) or when no
    entry point is registered. Neither input list is mutated.
    """
    if any(is_entry_point_command(command) for command in desired):
        return []
    return [
        to_overwrite_payload(command)
        for command in existing
        if is_entry_point_command(command)
    ]


async def overwrite_global_commands_preserving_entry_point(
    client: DiscordRestClient,
    application_id: str,
    commands: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Bulk-overwrite the global commands with ``commands``, keeping the entry point.

    Raises :class:`~platform_shared.services.discord.client.DiscordApiError` if
    either the listing or the overwrite fails. A failed listing aborts before
    any write — the overwrite is never sent blind.

    Returns the command list Discord reports after the overwrite (entry point
    included when one was carried).
    """
    existing = await client.list_global_commands(
        application_id, with_localizations=True,
    )
    carried = entry_points_to_carry(commands, existing)
    for command in carried:
        logger.info(
            "Keeping Discord Activity entry-point command name=%s id=%s "
            "in the global command overwrite",
            command.get("name"),
            command.get("id"),
        )
    return await client.bulk_overwrite_global_commands(
        application_id, [*commands, *carried],
    )
