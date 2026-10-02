"""Unit tests for app.services.wow.raid_deadline — the form's grammar, the clock, the reconcile table.

Pure: ``now`` is passed in.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy
from app.services.discord.raid_context import signup_refusal
from app.services.wow.raid_deadline import (
    MAX_MINUTES,
    DeadlineError,
    Reconciled,
    deadline_at,
    deadline_due,
    deadline_passed,
    deadline_prefill,
    deadline_words,
    is_started,
    parse_deadline,
    reconcile,
    status_lines,
)

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
# A two-hour deadline falls at _AT; a minute either side of it, and a day before.
_AT = _STARTS - timedelta(hours=2)
_AHEAD = _AT - timedelta(minutes=1)
_PASSED = _AT + timedelta(minutes=1)
_EARLIER = _AT - timedelta(days=1)

_DEADLINE = {"signup_deadline_minutes": 120}
_BY_DEADLINE = {"closed_at": _EARLIER, "close_reason": "deadline", "deadline_applied_at": _EARLIER}
_BY_LEADER = {"closed_at": _EARLIER, "close_reason": "leader"}


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _status(**row: object) -> list[str]:
    return status_lines(_event(**row), EMPTY_EMOJIS)


# ---------------------------------------------------------------------------
# The form
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "minutes"),
    [
        ("2", 120),
        ("1.5", 90),
        (" 90m ", 90),
        ("1d 6h", 1800),
        ("1h30m", 90),
        ("2 hours", 120),
        ("1 day 6 hrs", 1800),
        ("45 mins", 45),
        ("1D", 1440),
        ("168", MAX_MINUTES),
        ("7d", MAX_MINUTES),
        ("0", None),
        ("0h", None),
        ("", None),
        ("   ", None),
    ],
)
def test_the_form_reads_a_number_as_hours_or_days_hours_and_minutes(text: str, minutes: int | None) -> None:
    assert parse_deadline(text) == minutes


@pytest.mark.parametrize("text", ["-2", "2 x", "1d 6", "soon", "h", "1.2.3", "2h-1"])
def test_the_form_refuses_what_it_cant_read(text: str) -> None:
    with pytest.raises(DeadlineError) as raised:
        parse_deadline(text)
    assert raised.value.kind == "format"


@pytest.mark.parametrize("text", ["7d 1m", "169", "10081m", "8 days"])
def test_a_deadline_is_at_most_seven_days_before_the_start(text: str) -> None:
    with pytest.raises(DeadlineError) as raised:
        parse_deadline(text)
    assert raised.value.kind == "too_long"


@pytest.mark.parametrize(
    ("minutes", "words", "prefill"),
    [
        (1, "1 minute", "1m"),
        (90, "1 hour 30 minutes", "1h 30m"),
        (120, "2 hours", "2h"),
        (1440, "1 day", "1d"),
        (1801, "1 day 6 hours 1 minute", "1d 6h 1m"),
        (MAX_MINUTES, "7 days", "7d"),
    ],
)
def test_a_deadline_reads_as_words_and_its_form_reads_back_the_same(minutes: int, words: str, prefill: str) -> None:
    assert deadline_words(minutes) == words
    assert deadline_prefill(minutes) == prefill
    assert parse_deadline(prefill) == minutes
    assert deadline_prefill(None) == ""


# ---------------------------------------------------------------------------
# The clock
# ---------------------------------------------------------------------------


def test_the_deadline_closes_sign_ups_from_its_very_second() -> None:
    event = _event(**_DEADLINE)
    assert deadline_at(event) == _AT
    before = _AT - timedelta(seconds=1)
    assert not deadline_passed(event, before) and not deadline_due(event, before)
    assert deadline_passed(event, _AT) and deadline_due(event, _AT)
    # Once applied (by the sweep, or a leader's tap) it's passed but no longer due.
    event.deadline_applied_at = _AT
    assert deadline_passed(event, _PASSED) and not deadline_due(event, _PASSED)
    # No deadline: sign-ups close when the raid starts.
    assert deadline_at(_event()) is None
    assert not deadline_passed(_event(), _STARTS)


def test_sign_ups_refuse_at_the_deadline_by_the_clock_and_a_reopen_after_it_holds() -> None:
    event = _event(**_DEADLINE)
    assert signup_refusal(event, _AHEAD) is None
    assert signup_refusal(event, _AT) == raid_copy.CLOSED  # before any sweep has run
    event.deadline_applied_at = _AT  # Raid: Open after the deadline keeps it applied
    assert signup_refusal(event, _PASSED) is None
    assert signup_refusal(event, _STARTS) == raid_copy.RAID_STARTED
    event.closed_at = _PASSED
    assert signup_refusal(event, _PASSED) == raid_copy.CLOSED


def test_started_means_the_sweep_greyed_the_post_and_it_wasnt_cancelled_since() -> None:
    assert not is_started(_event())
    assert not is_started(_event(starts_at=_EARLIER))  # past its start, not swept yet
    assert is_started(_event(start_applied_at=_STARTS))
    assert is_started(_event(start_applied_at=_STARTS, status="completed"))
    assert not is_started(_event(start_applied_at=_STARTS, status="cancelled"))


def test_the_posts_line_says_started_closed_or_when_sign_ups_close() -> None:
    closes = f"Sign-ups close <t:{int(_AT.timestamp())}:R>"
    assert _status() == []
    assert _status(**_DEADLINE) == [closes]
    assert _status(**_DEADLINE, status="draft") == [closes]  # the create preview shows it too
    assert _status(**_DEADLINE, deadline_applied_at=_PASSED) == []  # reopened after it: open until the start
    assert _status(**_DEADLINE, **_BY_LEADER) == ["**Sign-ups are closed.**"]
    assert _status(**_BY_DEADLINE, start_applied_at=_STARTS) == ["**This raid has started.**"]
    assert _status(start_applied_at=_STARTS) == ["**This raid has started.**"]
    assert _status(**_DEADLINE, status="cancelled") == []


# ---------------------------------------------------------------------------
# The reconcile table (the module docstring's), row by row
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("row", "now", "expected"),
    [
        pytest.param(
            {**_DEADLINE, **_BY_DEADLINE}, _AHEAD, Reconciled(None, None, None, "reopened"), id="ahead, closed by it"
        ),
        pytest.param(_BY_DEADLINE, _AHEAD, Reconciled(None, None, None, "reopened"), id="none, closed by it"),
        pytest.param(
            {**_DEADLINE, "deadline_applied_at": _EARLIER}, _AHEAD, Reconciled(None, None, None), id="ahead, reopened"
        ),
        pytest.param(
            {**_DEADLINE, **_BY_LEADER, "deadline_applied_at": _EARLIER},
            _AHEAD,
            Reconciled(_EARLIER, "leader", None),
            id="ahead, the leader's close stays",
        ),
        pytest.param(_DEADLINE, _AHEAD, None, id="ahead, open"),
        pytest.param(_BY_LEADER, _PASSED, None, id="none, the leader's close"),
        pytest.param(_DEADLINE, _PASSED, Reconciled(_PASSED, "deadline", _PASSED, "closed"), id="passed, open"),
        pytest.param(
            {**_DEADLINE, **_BY_LEADER}, _PASSED, Reconciled(_EARLIER, "leader", _PASSED), id="passed, closed"
        ),
        pytest.param({**_DEADLINE, **_BY_DEADLINE}, _PASSED, None, id="passed, applied and closed"),
        pytest.param({**_DEADLINE, "deadline_applied_at": _EARLIER}, _PASSED, None, id="passed, applied, reopened"),
    ],
)
def test_reconcile_squares_the_row_with_the_deadline_as_it_stands(
    row: dict[str, object], now: datetime, expected: Reconciled | None
) -> None:
    assert reconcile(_event(**row), now) == expected
