"""Unit tests for the raid CSV exports (``raid_csv``) — pure, no DB."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.models.wow.wow_raid_attendance import WowRaidAttendance
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_csv
from app.services.wow.raid_attendance import summarize
from app.services.wow.raid_catalog import raid_name
from app.services.wow.raid_csv import RAID_COLUMNS, SUMMARY_COLUMNS, safe_cell

_T0 = datetime(2001, 3, 1, 20, 0, tzinfo=timezone.utc)
_LEADER = "500000000000000001"
_BOM = b"\xef\xbb\xbf"


def _raid(day: int = 0, **overrides: object) -> WowRaidEvent:
    starts = _T0 + timedelta(days=day)
    fields: dict[str, object] = {
        "id": uuid.UUID(int=100 + day),
        "raid_key": "onyxia",
        "title": None,
        "starts_at": starts,
        "status": "completed",
        "attendance_counted": True,
        "attendance_recorded_at": starts + timedelta(hours=6),
        "signup_notes_enabled": True,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _signup(
    raid: WowRaidEvent, user_id: str, status: str = "confirmed", *, minute: int = 0, name: str | None = None,
    note: str | None = None,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=raid.id,
        discord_user_id=user_id,
        display_name=name or f"P{user_id}",
        character_name=None,
        wow_class="mage",
        role="dps",
        spec="frost",
        status=status,
        note=note,
        signed_up_at=_T0 - timedelta(days=1) + timedelta(minutes=minute),
    )


def _mark(
    raid: WowRaidEvent, user_id: str, outcome: str = "attended", *, status: str | None = "confirmed",
    by: str | None = None, name: str | None = None,
) -> WowRaidAttendance:
    marked_at = None
    if by is not None:
        marked_at = _T0 + timedelta(hours=7)
    return WowRaidAttendance(
        event_id=raid.id,
        discord_user_id=user_id,
        display_name=name or f"P{user_id}",
        character_name=None,
        wow_class="mage",
        signup_status=status,
        outcome=outcome,
        marked_by_user_id=by,
        marked_at=marked_at,
    )


def _rows(data: bytes) -> list[list[str]]:
    assert data.startswith(_BOM)
    return list(csv.reader(io.StringIO(data.decode("utf-8-sig"), newline="")))


def _cell(row: list[str], column: str) -> str:
    return row[RAID_COLUMNS.index(column)]


@pytest.mark.parametrize(
    ("value", "written"),
    [
        ("=1+1", "'=1+1"),
        ("+1", "'+1"),
        ("-1", "'-1"),
        ("@x", "'@x"),
        ("\tx", "'\tx"),
        ("\rx", "'\rx"),
        ("plain", "plain"),
        ("a=b", "a=b"),
        ("", ""),
        (None, ""),
    ],
)
def test_a_cell_a_spreadsheet_would_run_gets_a_quote(value: str | None, written: str) -> None:
    assert safe_cell(value) == written


def test_a_raid_file_is_a_bom_crlf_csv_named_for_the_raid() -> None:
    raid = _raid()
    name, data = raid_csv.raid_file(raid, [_signup(raid, "1")], [_mark(raid, "1")])
    assert name == "raid-onyxia-2001-03-01.csv"
    assert data.startswith(_BOM) and data.count(b"\r\n") == 2 and data.count(b"\n") == 2
    header, row = _rows(data)
    assert header == list(RAID_COLUMNS)
    assert row == [
        str(raid.id), raid_name("onyxia"), "", "2001-03-01 20:00:00", "yes",
        "1", "P1", "", "mage", "frost", "dps",
        "confirmed", "1", "2001-02-28 20:00:00", "",
        "attended", "",
    ]


def test_rows_run_in_sign_up_order_then_the_walk_ins() -> None:
    raid = _raid(attendance_counted=False)
    signups = [_signup(raid, "2", "queued", minute=2), _signup(raid, "1", minute=1), _signup(raid, "3", "bench", minute=3)]
    marks = [
        _mark(raid, "1", "no_show", by=_LEADER),
        _mark(raid, "2", "standby", status="queued"),
        _mark(raid, "9", status=None, by=_LEADER, name="Walk"),
    ]
    rows = _rows(raid_csv.raid_file(raid, signups, marks)[1])[1:]
    assert [_cell(r, "discord_user_id") for r in rows] == ["1", "2", "3", "9"]
    assert [_cell(r, "signup_order") for r in rows] == ["1", "2", "", ""]  # the bench has no place in line
    assert [_cell(r, "attendance") for r in rows] == ["no_show", "standby", "", "attended"]
    assert [_cell(r, "attendance_changed_by") for r in rows] == [_LEADER, "", "", _LEADER]
    assert {_cell(r, "counted") for r in rows} == {"no"}
    walk_in = rows[-1]
    assert _cell(walk_in, "name") == "Walk"
    assert [_cell(walk_in, c) for c in ("spec", "role", "signup_status", "signed_up_at_utc", "note")] == [""] * 5


def test_awkward_names_and_notes_survive_a_spreadsheet() -> None:
    raid = _raid(title='=HYPERLINK("x")')
    name = 'Smith, "J"\nJr'
    signups = [_signup(raid, "1", name=name, note="=1+1 bring pots"), _signup(raid, "2", minute=1, note="-ish")]
    rows = _rows(raid_csv.raid_file(raid, signups, [])[1])
    assert _cell(rows[1], "name") == name
    assert _cell(rows[1], "note") == "'=1+1 bring pots"
    assert _cell(rows[2], "note") == "'-ish"
    assert _cell(rows[1], "title") == "'=HYPERLINK(\"x\")"
    assert _cell(rows[1], "attendance") == ""  # not recorded
    hidden = _raid(signup_notes_enabled=False)
    assert _cell(_rows(raid_csv.raid_file(hidden, [_signup(hidden, "1", note="hi")], [])[1])[1], "note") == ""


def test_times_and_the_file_date_are_utc() -> None:
    evening_in_new_york = datetime(2001, 3, 1, 22, 0, tzinfo=ZoneInfo("America/New_York"))
    raid = _raid(starts_at=evening_in_new_york)
    name, data = raid_csv.raid_file(raid, [_signup(raid, "1")], [])
    assert name == "raid-onyxia-2001-03-02.csv"
    assert _cell(_rows(data)[1], "starts_at_utc") == "2001-03-02 03:00:00"


def test_the_window_is_a_summary_file_then_every_raids_rows_newest_first() -> None:
    r1, r2 = _raid(1), _raid(2, raid_key="mc")
    signups = {r1.id: [_signup(r1, "1")], r2.id: [_signup(r2, "1"), _signup(r2, "2", "late", minute=1)]}
    marks = [_mark(r1, "1"), _mark(r2, "1", "no_show", by=_LEADER), _mark(r2, "2", "late", status="late")]
    stats = summarize([r1, r2], marks, bench=False)
    (summary_name, summary), (long_name, long) = raid_csv.window_files(
        [r1, r2], signups, marks, stats, today=date(2001, 3, 5)
    )
    assert (summary_name, long_name) == ("attendance-2001-03-05.csv", "attendance-raids-2001-03-05.csv")

    header, *players = _rows(summary)
    assert header == list(SUMMARY_COLUMNS)
    assert [row[0] for row in players] == ["2", "1"]
    assert dict(zip(SUMMARY_COLUMNS, players[1])) == {
        "discord_user_id": "1", "name": "P1", "character": "", "class": "mage",
        "raids": "2", "present": "1", "percent": "50",
        "attended": "1", "late": "0", "standby": "0", "tentative": "0", "absent": "0", "no_show": "1", "missed": "0",
        "first_raid_utc": "2001-03-02 20:00:00", "last_raid_utc": "2001-03-03 20:00:00",
    }

    header, *rows = _rows(long)
    assert header == list(RAID_COLUMNS)
    assert [(_cell(r, "raid"), _cell(r, "discord_user_id")) for r in rows] == [
        (raid_name("mc"), "1"),
        (raid_name("mc"), "2"),
        (raid_name("onyxia"), "1"),
    ]


def test_an_empty_window_still_has_its_headers() -> None:
    files = raid_csv.window_files([], {}, [], [], today=date(2001, 3, 5))
    assert [_rows(data) for _, data in files] == [[list(SUMMARY_COLUMNS)], [list(RAID_COLUMNS)]]
