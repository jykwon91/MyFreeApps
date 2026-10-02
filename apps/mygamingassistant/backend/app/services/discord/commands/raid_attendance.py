"""/raid attendance, /raid-admin attendance and /raid-admin export.

* ``/raid attendance [raids]`` — anyone in a set-up server: their own raids
  over the last N counted ones.  Nobody else's.
* ``/raid-admin attendance [player] [raid] [raids] [bench]`` — Manage Events
  (the dispatcher checks it): every player's percentage, a page at a time;
  with ``player``, theirs raid by raid.
* ``/raid-admin export [event] [raids] [raid]`` — Manage Events: one raid's
  sign-ups and attendance (``event``: any raid but a draft), else the
  window's, as CSV.  'thinking…' now, the files after (``raid_export``).

``raids`` is how many recent counted raids (``WINDOW_DEFAULT`` unless given,
kept to 1…``WINDOW_MAX`` since Discord's limits are advisory); ``raid``
narrows them to one raid; ``bench`` counts standby as present.
"""
from __future__ import annotations

from typing import Any, Final

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import RAID_KEYS
from app.services.discord import raid_attendance_copy, raid_copy, raid_export
from app.services.discord.interaction import (
    Interaction,
    deferred_ephemeral_response,
    ephemeral_response,
    message_response,
)
from app.services.discord.raid_attendance_views import history_card, summary_card
from app.services.discord.raid_context import load_configured_guild, load_event, parse_event_id
from app.services.wow import raid_attendance_service
from app.services.wow.raid_attendance import WINDOW_DEFAULT, WINDOW_MAX, WindowQuery
from app.services.wow.raid_custom_id import is_member_id

# /raid-admin export's ``event``: any raid of the server but a draft.
_EXPORTABLE: Final = ("scheduled", "completed", "cancelled")


async def handle_own(interaction: Interaction) -> dict[str, Any]:
    """/raid attendance — the member's own raids in the window, newest first."""
    query = _query(interaction)
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        window = await raid_attendance_service.player_window(db, guild.id, query, interaction.user_id)
    return message_response(history_card(window, query, member=interaction.user_id, own=True))


async def handle_admin(interaction: Interaction) -> dict[str, Any]:
    """/raid-admin attendance — the summary's first page; with ``player``, their raids."""
    query = _query(interaction)
    player = interaction.str_option("player")
    if player is not None and not is_member_id(player):
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    if player is not None and interaction.resolved_is_bot(player):
        return ephemeral_response(raid_attendance_copy.BOTS_DONT_RAID)
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        if player is None:
            window = await raid_attendance_service.window(db, guild.id, query)
            return message_response(summary_card(window, query, 1))
        window = await raid_attendance_service.player_window(db, guild.id, query, player)
    return message_response(history_card(window, query, member=player, own=False))


async def handle_export(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    """/raid-admin export — one raid (``event``, which wins over the rest), else the window."""
    raw_event = interaction.str_option("event")
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        if raw_event is None:
            background.add_task(
                raid_export.export_window, guild.id, _query(interaction), interaction.application_id, interaction.token
            )
            return deferred_ephemeral_response()
        event_id = parse_event_id(raw_event)
        if event_id is None or await load_event(db, interaction, event_id, lock=False, statuses=_EXPORTABLE) is None:
            return ephemeral_response(raid_copy.NOT_FOUND)
    background.add_task(raid_export.export_raid, event_id, interaction.application_id, interaction.token)
    return deferred_ephemeral_response()


def _query(interaction: Interaction) -> WindowQuery:
    """The window the options ask for; a ``raid`` that isn't one (Discord's choices are advisory) is left out."""
    raid = interaction.str_option("raid")
    if raid not in RAID_KEYS:
        raid = None
    return WindowQuery(raid_key=raid, count=_count(interaction), bench=interaction.bool_option("bench") is True)


def _count(interaction: Interaction) -> int:
    count = interaction.int_option("raids")
    if count is None:
        return WINDOW_DEFAULT
    return min(max(count, 1), WINDOW_MAX)
