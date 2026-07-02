"""Pure tests for app.mappers.resume_mapper.map_work_history.

The mapper takes Claude's parsed resume JSON and returns WorkHistory model
instances — no DB, no mocks needed. The is_current cases are the regression
suite for the bug where Claude's flag was read (to decide whether to parse
``ends_on``) but never persisted, so every role's "Present" rendering fell
back to the lossy ``end_date IS NULL`` derivation.
"""
from __future__ import annotations

import uuid
from datetime import date

from app.mappers.resume_mapper import map_work_history

_USER_ID = uuid.uuid4()
_PROFILE_ID = uuid.uuid4()


def _entry(**overrides) -> dict:
    item = {
        "company": "Acme Corp",
        "title": "Senior Engineer",
        "starts_on": "2020-01",
        "ends_on": "2022-12",
        "is_current": False,
        "bullets": ["Did things"],
    }
    item.update(overrides)
    return item


def _map_one(**overrides):
    rows = map_work_history([_entry(**overrides)], _USER_ID, _PROFILE_ID)
    assert len(rows) == 1
    return rows[0]


def test_is_current_true_persists_on_model():
    row = _map_one(is_current=True, ends_on=None)
    assert row.is_current is True
    assert row.end_date is None


def test_is_current_true_ignores_ends_on():
    """Claude occasionally emits both — the flag wins and the end date is
    dropped, matching the DB constraint (current roles have no end date)."""
    row = _map_one(is_current=True, ends_on="2023-05")
    assert row.is_current is True
    assert row.end_date is None


def test_is_current_false_with_end_date_persists_both():
    row = _map_one(is_current=False, ends_on="2022-12")
    assert row.is_current is False
    assert row.end_date == date(2022, 12, 1)


def test_is_current_false_with_no_end_date_stays_not_current():
    """The OneOncology case: unknown end date must NOT become "Present"."""
    row = _map_one(is_current=False, ends_on=None)
    assert row.is_current is False
    assert row.end_date is None


def test_missing_is_current_defaults_to_false():
    item = _entry()
    del item["is_current"]
    rows = map_work_history([item], _USER_ID, _PROFILE_ID)
    assert rows[0].is_current is False
    assert rows[0].end_date == date(2022, 12, 1)
