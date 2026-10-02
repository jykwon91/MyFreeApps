"""Unit tests for the raid attendance rules (``raid_attendance``) and its custom_ids — pure, no DB."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.wow.wow_raid_attendance import ATTENDANCE_OUTCOMES, WowRaidAttendance
from app.models.wow.wow_raid_event import RAID_KEYS, WowRaidEvent
from app.models.wow.wow_raid_signup import SIGNUP_STATUSES, WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_attendance import (
    PAGE_SIZE,
    SETTABLE_OUTCOMES,
    WINDOW_DEFAULT,
    WINDOW_MAX,
    WindowQuery,
    can_record_now,
    capped,
    grouped,
    history,
    is_present,
    outcome_for,
    page_of,
    percent,
    preview_counts,
    record_due_at,
    recorded_early,
    snapshot,
    summarize,
)
from app.services.wow.raid_custom_id import ATTENDANCE_HUB_VERBS, NO_ARG, RaidCustomId

_T0 = datetime(2001, 3, 1, 20, 0, tzinfo=timezone.utc)
_EVENT = uuid.UUID(int=7)
_MEMBER = "123456789012345678"
_OUTCOMES = {
    "confirmed": "attended",
    "late": "late",
    "bench": "standby",
    "queued": "standby",
    "tentative": "tentative",
    "absence": "absent",
}


def _raid(day: int, **overrides: object) -> WowRaidEvent:
    """A completed, recorded, counted raid *day* days after ``_T0``."""
    starts = _T0 + timedelta(days=day)
    fields: dict[str, object] = {
        "id": uuid.UUID(int=1000 + day),
        "raid_key": "onyxia",
        "title": None,
        "starts_at": starts,
        "status": "completed",
        "attendance_counted": True,
        "attendance_recorded_at": starts + timedelta(hours=6),
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _mark(raid: WowRaidEvent, player: str, outcome: str = "attended", *, name: str | None = None) -> WowRaidAttendance:
    return WowRaidAttendance(
        event_id=raid.id,
        discord_user_id=player,
        display_name=name or f"P{player}",
        character_name=None,
        wow_class="mage",
        signup_status="confirmed",
        outcome=outcome,
        marked_by_user_id=None,
        marked_at=None,
    )


def _signup(user_id: str, status: str) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=_EVENT,
        discord_user_id=user_id,
        display_name=f"P{user_id}",
        character_name="Jaina",
        wow_class="mage",
        status=status,
        signed_up_at=_T0,
    )


# ---------------------------------------------------------------------------
# Outcomes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("status", "outcome"), _OUTCOMES.items())
def test_each_sign_up_status_records_as_its_outcome(status: str, outcome: str) -> None:
    assert outcome_for(status) == outcome


def test_every_sign_up_status_has_an_outcome() -> None:
    assert set(_OUTCOMES) == set(SIGNUP_STATUSES)
    assert set(_OUTCOMES.values()) <= set(ATTENDANCE_OUTCOMES)
    assert "tentative" not in SETTABLE_OUTCOMES


def test_present_is_attended_or_late_and_standby_only_with_bench() -> None:
    assert [o for o in ATTENDANCE_OUTCOMES if is_present(o, bench=False)] == ["attended", "late"]
    assert [o for o in ATTENDANCE_OUTCOMES if is_present(o, bench=True)] == ["attended", "late", "standby"]


def test_the_snapshot_is_a_row_per_sign_up_and_the_preview_counts_them() -> None:
    signups = [_signup("1", "confirmed"), _signup("2", "confirmed"), _signup("3", "queued"), _signup("4", "absence")]
    rows = snapshot(signups)
    assert [(r.discord_user_id, r.signup_status, r.outcome) for r in rows] == [
        ("1", "confirmed", "attended"),
        ("2", "confirmed", "attended"),
        ("3", "queued", "standby"),
        ("4", "absence", "absent"),
    ]
    assert (rows[0].display_name, rows[0].character_name, rows[0].wow_class) == ("P1", "Jaina", "mage")
    assert preview_counts(signups) == {"attended": 2, "standby": 1, "absent": 1}
    assert list(preview_counts([_signup("5", "absence"), _signup("6", "late")])) == ["late", "absent"]
    assert preview_counts([]) == {}


def test_the_card_groups_by_outcome_then_name() -> None:
    raid = _raid(1)
    marks = [
        _mark(raid, "1", "no_show", name="zed"),
        _mark(raid, "2", "attended", name="Bob"),
        _mark(raid, "3", "attended", name="alice"),
        _mark(raid, "4", "late", name="Cy"),
    ]
    groups = [(outcome, [m.display_name for m in players]) for outcome, players in grouped(marks)]
    assert groups == [("attended", ["alice", "Bob"]), ("late", ["Cy"]), ("no_show", ["zed"])]


# ---------------------------------------------------------------------------
# Stats over a window
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("present", "raids", "expected"), [(1, 8, 13), (2, 3, 67), (1, 3, 33), (0, 5, 0), (4, 4, 100)])
def test_percent_rounds_half_up(present: int, raids: int, expected: int) -> None:
    assert percent(present, raids) == expected


def test_a_player_counts_from_their_first_raid_in_the_window() -> None:
    r1, r2, r3, r4 = (_raid(day) for day in (1, 2, 3, 4))
    marks = [
        _mark(r1, "a", "attended", name="Old"),
        _mark(r3, "a", "late", name="New"),
        _mark(r3, "b", "attended"),
        _mark(r4, "b", "no_show"),
        _mark(r4, "c", "attended"),
    ]
    stats = summarize([r4, r2, r1, r3], marks, bench=False)
    assert [s.discord_user_id for s in stats] == ["c", "a", "b"]
    c, a, b = stats
    assert (c.raids, c.present, c.percent, c.missed) == (1, 1, 100, 0)
    assert (a.raids, a.present, a.percent, a.missed) == (4, 2, 50, 2)
    assert (b.raids, b.present, b.percent, b.missed) == (2, 1, 50, 0)
    assert dict(a.counts) == {"attended": 1, "late": 1}
    assert (a.first_at, a.last_at) == (r1.starts_at, r3.starts_at)
    assert a.name == "New"  # the newest row's name


def test_one_in_eight_is_13_percent_and_ties_go_by_name() -> None:
    raids = [_raid(day) for day in range(8)]
    marks = [_mark(raids[0], "1", name="bob"), _mark(raids[0], "2", name="Alice")]
    marks += [_mark(raid, "1", "absent", name="bob") for raid in raids[1:]]
    marks += [_mark(raid, "2", "no_show", name="Alice") for raid in raids[1:]]
    stats = summarize(raids, marks, bench=False)
    assert [(s.name, s.percent, s.present, s.raids) for s in stats] == [("Alice", 13, 1, 8), ("bob", 13, 1, 8)]


def test_standby_counts_only_with_bench_and_other_raids_rows_are_left_out() -> None:
    r1, r2 = _raid(1), _raid(2)
    outside = _raid(9)
    marks = [_mark(r1, "a", "standby"), _mark(r2, "a", "standby"), _mark(outside, "a", "attended")]
    assert summarize([r1, r2], marks, bench=False)[0].percent == 0
    assert summarize([r1, r2], marks, bench=True)[0].percent == 100
    assert summarize([r1, r2], [_mark(outside, "z")], bench=False) == []


def test_history_is_newest_first_from_their_first_raid() -> None:
    r1, r2, r3, r4 = (_raid(day) for day in (1, 2, 3, 4))
    stats, lines = history([r1, r2, r3, r4], [_mark(r2, "a", "attended"), _mark(r4, "a", "absent")], bench=False)
    assert stats is not None and (stats.raids, stats.present, stats.missed) == (3, 1, 1)
    assert [(line.event.id, line.outcome) for line in lines] == [(r4.id, "absent"), (r3.id, None), (r2.id, "attended")]
    assert history([r1, r2], [], bench=False) == (None, [])


def test_history_shows_25_raids_and_counts_the_rest() -> None:
    raids = [_raid(day) for day in range(30)]
    _, lines = history(raids, [_mark(raid, "a") for raid in raids], bench=False)
    shown, older = capped(lines)
    assert (len(shown), older) == (25, 5)
    assert shown[0].event.id == raids[-1].id
    assert capped(lines[:3]) == (lines[:3], 0)


def test_pages_clamp_to_the_ones_there_are() -> None:
    items = list(range(2 * PAGE_SIZE + 10))
    assert page_of(items, 1) == (items[:PAGE_SIZE], 1, 3)
    assert page_of(items, 0)[1:] == (1, 3)
    shown, page, pages = page_of(items, 99)
    assert (shown, page, pages) == (items[2 * PAGE_SIZE :], 3, 3)
    assert page_of([], 4) == ([], 1, 1)


def test_record_now_needs_a_started_raid_that_is_on_and_not_recorded() -> None:
    now = _T0 + timedelta(hours=1)
    started = _raid(0, status="scheduled", attendance_recorded_at=None)
    assert can_record_now(started, now)
    assert not can_record_now(started, _T0 - timedelta(seconds=1))
    assert not can_record_now(_raid(0, status="completed", attendance_recorded_at=None), now)
    assert not can_record_now(_raid(0, status="cancelled", attendance_recorded_at=None), now)
    assert not can_record_now(_raid(0, status="scheduled", attendance_recorded_at=_T0), now)
    assert record_due_at(started) == _T0 + timedelta(hours=6)
    assert recorded_early(_raid(0, status="scheduled", attendance_recorded_at=now))
    assert not recorded_early(_raid(0))  # recorded as it completed


# ---------------------------------------------------------------------------
# custom_ids
# ---------------------------------------------------------------------------


def test_a_window_reads_back_from_its_args() -> None:
    assert WindowQuery() == WindowQuery(raid_key=None, count=WINDOW_DEFAULT, bench=False)
    assert WindowQuery().to_args() == ("-", "10", "0")
    query = WindowQuery(raid_key="mc", count=WINDOW_MAX, bench=True)
    assert WindowQuery.from_args(*query.to_args()) == query


def test_every_attendance_id_round_trips() -> None:
    cases = [(verb, NO_ARG, NO_ARG) for verb in ATTENDANCE_HUB_VERBS]
    cases += [("who", NO_ARG, menu) for menu in ("1", "2", "3")]
    cases += [("set", _MEMBER, outcome) for outcome in SETTABLE_OUTCOMES] + [("drop", _MEMBER, NO_ARG)]
    for verb, member, arg in cases:
        custom_id = raid_custom_id.attendance(_EVENT, verb, member, arg)
        assert raid_custom_id.parse(custom_id) == RaidCustomId("at", _EVENT, (verb, member, arg)), custom_id


def test_every_summary_id_round_trips() -> None:
    for query in (WindowQuery(), WindowQuery(raid_key="onyxia", count=1, bench=True)):
        for verb, page in (("page", "1"), ("page", "99"), ("csv", NO_ARG)):
            parsed = raid_custom_id.parse(raid_custom_id.summary(verb, query, page))
            assert parsed == RaidCustomId("as", None, (verb, *query.to_args(), page))
            assert WindowQuery.from_args(*parsed.args[1:4]) == query


@pytest.mark.parametrize(
    "custom_id",
    [
        f"raid:v1:at:{_EVENT}:jump:-:-",
        f"raid:v1:at:{_EVENT}:open:{_MEMBER}:-",
        f"raid:v1:at:{_EVENT}:record:-:1",
        f"raid:v1:at:{_EVENT}:set:{_MEMBER}:tentative",
        f"raid:v1:at:{_EVENT}:set:-:attended",
        f"raid:v1:at:{_EVENT}:set:12345:attended",
        f"raid:v1:at:{_EVENT}:drop:{_MEMBER}:attended",
        f"raid:v1:at:{_EVENT}:who:-:4",
        f"raid:v1:at:{_EVENT}:who:{_MEMBER}:1",
        f"raid:v1:at:{_EVENT}:open:-",
        "raid:v1:at:not-a-uuid:open:-:-",
        "raid:v1:as:page:-:10:0:0",
        "raid:v1:as:page:-:10:0:100",
        "raid:v1:as:page:-:10:0:-",
        "raid:v1:as:csv:-:10:0:1",
        "raid:v1:as:page:-:0:0:1",
        "raid:v1:as:page:-:51:0:1",
        "raid:v1:as:page:-:05:0:1",
        "raid:v1:as:page:-:10:2:1",
        "raid:v1:as:page:not_a_raid:10:0:1",
        "raid:v1:as:skip:-:10:0:1",
        "raid:v1:as:page:-:10:0",
        f"raid:v1:as:{_EVENT}:page:-:10:0:1",
    ],
)
def test_ids_the_bot_never_writes_are_refused(custom_id: str) -> None:
    assert raid_custom_id.parse(custom_id) is None


def test_the_longest_ids_fit_discords_100_characters() -> None:
    member = "9" * 20
    ids = [
        raid_custom_id.attendance(uuid.uuid4(), "set", member, "no_show"),
        raid_custom_id.attendance(uuid.uuid4(), "drop", member),
        raid_custom_id.attendance(uuid.uuid4(), "nocount"),
    ]
    for raid in ("barrow_deeps", max(RAID_KEYS, key=len)):
        ids.append(raid_custom_id.summary("page", WindowQuery(raid_key=raid, count=WINDOW_MAX, bench=True), "99"))
    assert all(len(custom_id) <= 100 for custom_id in ids)
    assert all(raid_custom_id.parse(custom_id) is not None for custom_id in ids)
