"""Raid sign-ups and attendance as CSV files — pure.

``raid_rows`` is one raid: a row per sign-up, then a row per player on its
attendance who isn't signed up (walk-ins a leader added).  ``summary_rows`` is
a row per player over a window (``raid_attendance.summarize``).  The per-raid
export is one file (``raid_file``); a window is two (``window_files``): the
summary and the long file, every raid's rows.

Files are UTF-8 with a BOM (so Excel reads names right) and CRLF line ends.
Every text cell goes through ``safe_cell``: a leading ``=``, ``+``, ``-``,
``@``, tab or CR gets a ``'``, so a spreadsheet never runs it as a formula
(OWASP CSV injection); the csv module quotes commas, quotes and newlines.
Ids, numbers and times are written as they are; times in UTC.  Stored keys
(class, spec, role, status, outcome) go out as stored.
"""
from __future__ import annotations

import csv
import io
import uuid
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime, timezone
from typing import Final

from app.models.wow.wow_raid_attendance import ATTENDANCE_OUTCOMES, WowRaidAttendance
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_attendance import PlayerStats, in_card_order
from app.services.wow.raid_catalog import raid_name
from app.services.wow.raid_note import shown_note
from app.services.wow.raid_roster import in_line_order, order_numbers

RAID_COLUMNS: Final = (
    "raid_id", "raid", "title", "starts_at_utc", "counted",
    "discord_user_id", "name", "character", "class", "spec", "role",
    "signup_status", "signup_order", "signed_up_at_utc", "note",
    "attendance", "attendance_changed_by",
)
SUMMARY_COLUMNS: Final = (
    "discord_user_id", "name", "character", "class", "raids", "present", "percent",
    "attended", "late", "standby", "tentative", "absent", "no_show", "missed",
    "first_raid_utc", "last_raid_utc",
)
_FORMULA_STARTS: Final = ("=", "+", "-", "@", "\t", "\r")
_COUNTED: Final = {True: "yes", False: "no"}

# A file to attach: its name and its bytes.
CsvFile = tuple[str, bytes]


def safe_cell(value: str | None) -> str:
    """A text cell: '' for None, and a ``'`` before anything a spreadsheet would read as a formula."""
    if value is None:
        return ""
    if value.startswith(_FORMULA_STARTS):
        return "'" + value
    return value


def raid_rows(
    event: WowRaidEvent, signups: Iterable[WowRaidSignup], marks: Iterable[WowRaidAttendance]
) -> list[list[str]]:
    """The raid's rows: each sign-up in order, then everyone on its attendance who isn't signed up.

    ``attendance`` is blank until the raid is recorded (and for a sign-up made after an early record).
    """
    signups = in_line_order(signups)
    by_player = {mark.discord_user_id: mark for mark in marks}
    numbers = order_numbers(signups)
    raid = _raid_cells(event)
    rows = []
    for signup in signups:
        mark = by_player.pop(signup.discord_user_id, None)
        rows.append([
            *raid,
            signup.discord_user_id,
            safe_cell(signup.display_name),
            safe_cell(signup.character_name),
            safe_cell(signup.wow_class),
            safe_cell(signup.spec),
            safe_cell(signup.role),
            signup.status,
            _number(numbers.get(signup.discord_user_id)),
            _time(signup.signed_up_at),
            safe_cell(shown_note(event, signup)),
            *_mark_cells(mark),
        ])
    for mark in in_card_order(by_player.values()):
        rows.append([
            *raid,
            mark.discord_user_id,
            safe_cell(mark.display_name),
            safe_cell(mark.character_name),
            safe_cell(mark.wow_class),
            "",
            "",
            safe_cell(mark.signup_status),
            "",
            "",
            "",
            *_mark_cells(mark),
        ])
    return rows


def summary_rows(stats: Iterable[PlayerStats]) -> list[list[str]]:
    """A row per player over the window, in the summary's order."""
    return [
        [
            player.discord_user_id,
            safe_cell(player.display_name),
            safe_cell(player.character_name),
            safe_cell(player.wow_class),
            str(player.raids),
            str(player.present),
            str(player.percent),
            *(str(player.counts.get(outcome, 0)) for outcome in ATTENDANCE_OUTCOMES),
            str(player.missed),
            _time(player.first_at),
            _time(player.last_at),
        ]
        for player in stats
    ]


def raid_file(
    event: WowRaidEvent, signups: Iterable[WowRaidSignup], marks: Iterable[WowRaidAttendance]
) -> CsvFile:
    """'raid-<raid_key>-<YYYY-MM-DD>.csv' (its start's UTC date): the raid's rows."""
    name = f"raid-{event.raid_key}-{_day(event.starts_at)}.csv"
    return name, _encode(RAID_COLUMNS, raid_rows(event, signups, marks))


def window_files(
    raids: Sequence[WowRaidEvent],
    signups: Mapping[uuid.UUID, Sequence[WowRaidSignup]],
    marks: Iterable[WowRaidAttendance],
    stats: Iterable[PlayerStats],
    *,
    today: date,
) -> list[CsvFile]:
    """'attendance-<date>.csv' (a row per player) and 'attendance-raids-<date>.csv' (every raid's rows, newest first).

    *signups* and the rows of *marks* are the window's, by raid id.
    """
    marks_by_raid: dict[uuid.UUID, list[WowRaidAttendance]] = {}
    for mark in marks:
        marks_by_raid.setdefault(mark.event_id, []).append(mark)
    newest_first = sorted(raids, key=lambda event: (event.starts_at, event.id), reverse=True)
    long_rows = [
        row
        for event in newest_first
        for row in raid_rows(event, signups.get(event.id, ()), marks_by_raid.get(event.id, ()))
    ]
    return [
        (f"attendance-{today.isoformat()}.csv", _encode(SUMMARY_COLUMNS, summary_rows(stats))),
        (f"attendance-raids-{today.isoformat()}.csv", _encode(RAID_COLUMNS, long_rows)),
    ]


def _raid_cells(event: WowRaidEvent) -> list[str]:
    return [
        str(event.id),
        safe_cell(raid_name(event.raid_key)),
        safe_cell(event.title),
        _time(event.starts_at),
        _COUNTED[event.attendance_counted],
    ]


def _mark_cells(mark: WowRaidAttendance | None) -> list[str]:
    if mark is None:
        return ["", ""]
    return [mark.outcome, mark.marked_by_user_id or ""]


def _number(value: int | None) -> str:
    if value is None:
        return ""
    return str(value)


def _time(value: datetime | None) -> str:
    """'2001-03-01 12:00:00' in UTC (ISO 8601 with a space, which spreadsheets read as a time)."""
    if value is None:
        return ""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _day(value: datetime) -> str:
    return value.astimezone(timezone.utc).date().isoformat()


def _encode(header: Sequence[str], rows: Iterable[Sequence[str]]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8-sig")
