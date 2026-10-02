"""The CSV exports' second half, in the background: build the files, then put them on the reply.

[Export CSV] on the Attendance card and on the /raid-admin attendance summary,
and /raid-admin export, answer 'thinking…' (a private reply) at once.  These
load what they need in their own transaction, build the CSV (``raid_csv``) and
attach it to that reply (``@original``) in one multipart edit.

When Discord refuses the upload (the bot can't attach files there, or it's
too big) or anything else goes wrong, the reply says so (``EXPORT_FAILED``).
Logs carry ids and counts, never names or notes.  Never raises.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence

from platform_shared.services.discord import DiscordApiError, DiscordFile

from app.db.session import unit_of_work
from app.services.discord import raid_attendance_copy, raid_copy, raid_publisher, rest
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_context import utcnow
from app.services.wow import raid_attendance_service, raid_csv
from app.services.wow.raid_attendance import WindowQuery, summarize
from app.services.wow.raid_csv import CsvFile
from app.services.wow.raid_text import title_text

logger = logging.getLogger(__name__)


async def export_raid(event_id: uuid.UUID, application_id: str, token: str) -> None:
    """One raid's sign-ups and attendance, as one file."""
    try:
        async with unit_of_work() as db:
            found = await raid_attendance_service.exported_raid(db, event_id)
        if found is None:
            await _say(application_id, token, raid_copy.NOT_FOUND)
            return
        event, sheet = found
        files = [raid_csv.raid_file(event, sheet.signups, sheet.marks)]
        logger.info("raid_export: raid %s signups=%d rows=%d", event_id, len(sheet.signups), len(sheet.marks))
    except Exception:
        logger.exception("raid_export: building raid %s's file failed", event_id)
        await _say(application_id, token, raid_attendance_copy.EXPORT_FAILED)
        return
    await _upload(application_id, token, raid_attendance_copy.export_done_raid(title_text(event)), files)


async def export_window(guild_id: uuid.UUID, query: WindowQuery, application_id: str, token: str) -> None:
    """The window's: a file with a row per player, and one with every raid's rows."""
    try:
        async with unit_of_work() as db:
            window = await raid_attendance_service.window(db, guild_id, query)
            signups = await raid_attendance_service.window_signups(db, window.raids)
        if not window.raids:
            await _say(application_id, token, raid_attendance_copy.EXPORT_NOTHING)
            return
        stats = summarize(window.raids, window.marks, bench=query.bench)
        files = raid_csv.window_files(window.raids, signups, window.marks, stats, today=utcnow().date())
        logger.info(
            "raid_export: guild %s raids=%d players=%d rows=%d",
            guild_id,
            len(window.raids),
            len(stats),
            len(window.marks),
        )
    except Exception:
        logger.exception("raid_export: building guild %s's files failed", guild_id)
        await _say(application_id, token, raid_attendance_copy.EXPORT_FAILED)
        return
    await _upload(application_id, token, raid_attendance_copy.export_done_window(len(window.raids)), files)


async def _upload(application_id: str, token: str, content: str, files: Sequence[CsvFile]) -> None:
    """Attach *files* to the reply under *content*; ``EXPORT_FAILED`` on it when that doesn't work."""
    attachments = [DiscordFile(name, data) for name, data in files]
    async with rest.make_rest_client() as client:
        try:
            await rest.bounded(
                client.edit_original_interaction_response_with_files(
                    application_id, token, {"content": content}, attachments
                )
            )
            return
        except DiscordApiError as error:
            logger.warning("raid_export: upload refused status=%s code=%s", error.status, error.code)
        except Exception:
            logger.exception("raid_export: upload failed")
        await raid_publisher.edit_original(
            client, application_id, token, ephemeral_data(raid_attendance_copy.EXPORT_FAILED)
        )


async def _say(application_id: str, token: str, content: str) -> None:
    """Replace the reply's 'thinking…' with *content* (no file)."""
    async with rest.make_rest_client() as client:
        await raid_publisher.edit_original(client, application_id, token, ephemeral_data(content))
