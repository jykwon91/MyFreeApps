"""Unit tests for the notification schedule builder.

Tests _build_schedule_rows() — a pure function that derives notification rows
from guild settings and an event's starts_at.  No DB, no async.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.repositories.wow.wow_raid_notification_repo import _build_schedule_rows

_EVENT_ID = uuid.uuid4()
_STARTS_AT = datetime(2026, 12, 9, 20, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Default settings
# ---------------------------------------------------------------------------


def test_default_settings_produces_four_rows():
    """With default guild settings: 2 nudges + 1 consumables + 1 ready-check."""
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    assert len(rows) == 4


def test_default_nudge_kinds_and_times():
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    nudge_rows = [r for r in rows if r["kind"] == "signup_nudge"]
    assert len(nudge_rows) == 2
    expected_times = {
        _STARTS_AT - timedelta(hours=48),
        _STARTS_AT - timedelta(hours=24),
    }
    actual_times = {r["due_at"] for r in nudge_rows}
    assert actual_times == expected_times


def test_default_consumables_time():
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    c_rows = [r for r in rows if r["kind"] == "consumables_reminder"]
    assert len(c_rows) == 1
    assert c_rows[0]["due_at"] == _STARTS_AT - timedelta(hours=24)


def test_default_ready_check_time():
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    rc_rows = [r for r in rows if r["kind"] == "ready_check"]
    assert len(rc_rows) == 1
    assert rc_rows[0]["due_at"] == _STARTS_AT - timedelta(hours=1)


def test_all_rows_have_null_target_user_id():
    """Default schedule = channel posts only."""
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    for row in rows:
        assert row["target_user_id"] is None


def test_all_rows_carry_correct_event_id():
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    for row in rows:
        assert row["event_id"] == _EVENT_ID


# ---------------------------------------------------------------------------
# Custom settings
# ---------------------------------------------------------------------------


def test_custom_single_nudge_offset():
    settings = {"nudge_offsets_minutes": [60]}
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, settings)
    nudge_rows = [r for r in rows if r["kind"] == "signup_nudge"]
    assert len(nudge_rows) == 1
    assert nudge_rows[0]["due_at"] == _STARTS_AT - timedelta(minutes=60)


def test_custom_three_nudge_offsets():
    settings = {"nudge_offsets_minutes": [10080, 4320, 1440]}  # 1 week, 3 days, 1 day
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, settings)
    nudge_rows = [r for r in rows if r["kind"] == "signup_nudge"]
    assert len(nudge_rows) == 3


def test_empty_nudge_offsets_produces_two_rows():
    """No nudges: only consumables_reminder + ready_check."""
    settings = {"nudge_offsets_minutes": []}
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, settings)
    assert len(rows) == 2
    kinds = {r["kind"] for r in rows}
    assert kinds == {"consumables_reminder", "ready_check"}


def test_custom_consumables_offset():
    settings = {"consumables_reminder_minutes": 120}
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, settings)
    c_rows = [r for r in rows if r["kind"] == "consumables_reminder"]
    assert c_rows[0]["due_at"] == _STARTS_AT - timedelta(minutes=120)


def test_custom_ready_check_offset():
    settings = {"ready_check_minutes": 15}
    rows = _build_schedule_rows(_EVENT_ID, _STARTS_AT, settings)
    rc_rows = [r for r in rows if r["kind"] == "ready_check"]
    assert rc_rows[0]["due_at"] == _STARTS_AT - timedelta(minutes=15)


# ---------------------------------------------------------------------------
# Idempotency contract (structural, not DB)
# ---------------------------------------------------------------------------


def test_same_inputs_produce_identical_rows():
    """schedule_for_event rows are deterministic — ON CONFLICT DO NOTHING is safe."""
    rows_a = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})
    rows_b = _build_schedule_rows(_EVENT_ID, _STARTS_AT, {})

    # Sort for comparison
    key = lambda r: (r["kind"], str(r["due_at"]))  # noqa: E731
    assert sorted(rows_a, key=key) == sorted(rows_b, key=key)
