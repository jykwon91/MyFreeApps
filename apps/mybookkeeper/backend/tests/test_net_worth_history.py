"""Net worth day by day from snapshots — pure, no database.

Pinned: a missed day carries the last value; a source no longer counted stops
at its last snapshot; a loan record linked to an account is skipped on days
the account has a value but fills the days before it; a value from before the
range carries in; the last point is always today's live total; snapshots of
sources no longer on the books are ignored.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.net_worth_constants import SOURCE_ACCOUNT, SOURCE_MORTGAGE
from app.schemas.net_worth.net_worth_history_point import NetWorthHistoryPoint
from app.services.net_worth.dated_value import DatedValue
from app.services.net_worth.history_source import HistorySource
from app.services.net_worth.net_worth_history import daily_points
from app.services.net_worth.snapshot_source_key import SnapshotSourceKey

_TODAY = _dt.date(2026, 11, 24)
_TODAY_POINT = NetWorthHistoryPoint(day=_TODAY, assets_cents=7, liabilities_cents=0, net_cents=7)


def _day(offset: int) -> _dt.date:
    return _TODAY - _dt.timedelta(days=offset)


def _key(source: str = SOURCE_ACCOUNT) -> SnapshotSourceKey:
    return SnapshotSourceKey(source, uuid.uuid4())


def _asset(counted_today: bool = True) -> HistorySource:
    return HistorySource("asset", "USD", counted_today)


def _nets(points: list[NetWorthHistoryPoint]) -> list[int]:
    return [p.net_cents for p in points]


def test_a_missed_day_carries_the_last_value_forward() -> None:
    cash = _key()
    points = daily_points(
        start=_day(3), today=_TODAY,
        values=[DatedValue(cash, _day(3), 100), DatedValue(cash, _day(1), 300)],
        sources={cash: _asset()},
        today_point=_TODAY_POINT,
    )
    assert [p.day for p in points] == [_day(3), _day(2), _day(1), _TODAY]
    assert _nets(points) == [100, 100, 300, 7]


def test_a_source_no_longer_counted_stops_at_its_last_snapshot() -> None:
    closed, open_ = _key(), _key()
    points = daily_points(
        start=_day(3), today=_TODAY,
        values=[DatedValue(closed, _day(3), 50), DatedValue(open_, _day(3), 10)],
        sources={closed: _asset(counted_today=False), open_: _asset()},
        today_point=_TODAY_POINT,
    )
    assert _nets(points)[:3] == [60, 10, 10]


def test_a_linked_loan_record_fills_the_days_before_its_account_and_never_overlaps() -> None:
    account = _key(SOURCE_ACCOUNT)
    record = _key(SOURCE_MORTGAGE)
    points = daily_points(
        start=_day(4), today=_TODAY,
        values=[
            DatedValue(record, _day(4), 200),
            DatedValue(record, _day(2), 190),  # the day it was linked
            DatedValue(account, _day(2), 189),
        ],
        sources={
            account: HistorySource("liability", "USD", True),
            record: HistorySource("liability", "USD", False, represented_by=account),
        },
        today_point=_TODAY_POINT,
    )
    assert [p.liabilities_cents for p in points[:4]] == [200, 200, 189, 189]


def test_a_value_from_before_the_range_carries_in() -> None:
    cash = _key()
    points = daily_points(
        start=_day(2), today=_TODAY,
        values=[DatedValue(cash, _day(40), 500)],
        sources={cash: _asset()},
        today_point=_TODAY_POINT,
    )
    assert _nets(points)[:2] == [500, 500]


def test_the_last_point_is_todays_live_total_not_a_snapshot() -> None:
    cash = _key()
    points = daily_points(
        start=_TODAY, today=_TODAY,
        values=[DatedValue(cash, _day(1), 999)],
        sources={cash: _asset()},
        today_point=_TODAY_POINT,
    )
    assert points == [_TODAY_POINT]


def test_snapshots_of_sources_no_longer_on_the_books_are_ignored() -> None:
    deleted = _key()
    points = daily_points(
        start=_day(1), today=_TODAY,
        values=[DatedValue(deleted, _day(1), 1_000)],
        sources={},
        today_point=_TODAY_POINT,
    )
    assert _nets(points) == [0, 7]


def test_another_currency_never_enters_the_total() -> None:
    euros = _key()
    points = daily_points(
        start=_day(1), today=_TODAY,
        values=[DatedValue(euros, _day(1), 1_000)],
        sources={euros: HistorySource("asset", "EUR", True)},
        today_point=_TODAY_POINT,
    )
    assert _nets(points) == [0, 7]
