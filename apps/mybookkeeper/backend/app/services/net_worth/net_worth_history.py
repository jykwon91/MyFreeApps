"""Net worth day by day, from the snapshots. Pure: no database, no I/O.

Each day takes every source's latest snapshot on or before it, so a day the
scheduler missed shows the value it last had rather than a dip to zero. A
source stops at its last snapshot once it no longer counts today (closed,
sold, now tracked by its account). A loan record linked to an account is
skipped on every day the account has a value, the same rule as today's total.

Today is not read from snapshots: the caller passes today's live totals, so
the last point on the chart is always the number at the top of the page.
"""
from __future__ import annotations

import datetime as _dt
from collections import defaultdict
from collections.abc import Iterable, Mapping

from app.core.financial_account_enums import CLASSIFICATION_ASSET
from app.core.net_worth_constants import NET_WORTH_CURRENCY
from app.schemas.net_worth.net_worth_history_point import NetWorthHistoryPoint
from app.services.net_worth.dated_value import DatedValue
from app.services.net_worth.history_source import HistorySource
from app.services.net_worth.snapshot_source_key import SnapshotSourceKey

_ONE_DAY = _dt.timedelta(days=1)


def _series_by_source(
    values: Iterable[DatedValue], sources: Mapping[SnapshotSourceKey, HistorySource],
) -> dict[SnapshotSourceKey, list[DatedValue]]:
    series: dict[SnapshotSourceKey, list[DatedValue]] = defaultdict(list)
    for value in values:
        source = sources.get(value.key)
        if source is not None and source.currency == NET_WORTH_CURRENCY:
            series[value.key].append(value)
    for points in series.values():
        points.sort(key=lambda v: v.day)
    return series


def _point(day: _dt.date, values: Mapping[SnapshotSourceKey, int], sources: Mapping[SnapshotSourceKey, HistorySource]) -> NetWorthHistoryPoint:
    assets = 0
    liabilities = 0
    for key, cents in values.items():
        represented_by = sources[key].represented_by
        if represented_by is not None and represented_by in values:
            continue
        if sources[key].classification == CLASSIFICATION_ASSET:
            assets += cents
        else:
            liabilities += cents
    return NetWorthHistoryPoint(
        day=day, assets_cents=assets, liabilities_cents=liabilities, net_cents=assets - liabilities,
    )


def daily_points(
    *,
    start: _dt.date,
    today: _dt.date,
    values: Iterable[DatedValue],
    sources: Mapping[SnapshotSourceKey, HistorySource],
    today_point: NetWorthHistoryPoint,
) -> list[NetWorthHistoryPoint]:
    """One point per day from ``start`` through yesterday, then ``today_point``.

    ``values`` are the snapshots dated ``start`` through yesterday plus each
    source's last one before ``start``.
    """
    series = _series_by_source(values, sources)
    last_day = {key: points[-1].day for key, points in series.items()}
    cursor = dict.fromkeys(series, 0)
    current: dict[SnapshotSourceKey, int] = {}
    points: list[NetWorthHistoryPoint] = []

    day = start
    while day < today:
        for key, items in series.items():
            i = cursor[key]
            while i < len(items) and items[i].day <= day:
                current[key] = items[i].cents
                i += 1
            cursor[key] = i
            if not sources[key].counted_today and day > last_day[key]:
                current.pop(key, None)
        points.append(_point(day, current, sources))
        day += _ONE_DAY
    points.append(today_point)
    return points
