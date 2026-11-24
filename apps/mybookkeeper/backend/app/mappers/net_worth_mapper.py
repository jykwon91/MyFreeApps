"""Turn net worth lines and snapshot rows into what the page shows.

Pure: no database, no I/O.
"""
from __future__ import annotations

import datetime as _dt
from collections.abc import Iterable, Sequence

from app.core.financial_account_enums import CLASSIFICATION_ASSET
from app.core.net_worth_constants import (
    NET_WORTH_CURRENCY,
    NET_WORTH_GROUPS,
    SOURCE_ACCOUNT,
    SOURCE_MORTGAGE,
    SOURCE_PROPERTY,
    STALE_AFTER_DAYS,
)
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.schemas.net_worth.net_worth_group_response import NetWorthGroupResponse
from app.schemas.net_worth.net_worth_history_point import NetWorthHistoryPoint
from app.schemas.net_worth.net_worth_line_response import NetWorthLineResponse
from app.schemas.net_worth.net_worth_response import NetWorthResponse
from app.services.net_worth.dated_value import DatedValue
from app.services.net_worth.net_worth_line import NetWorthLine
from app.services.net_worth.net_worth_lines import is_counted
from app.services.net_worth.snapshot_source_key import SnapshotSourceKey


def is_stale(as_of: _dt.date | None, today: _dt.date) -> bool:
    return as_of is not None and (today - as_of).days > STALE_AFTER_DAYS


def line_to_response(line: NetWorthLine, today: _dt.date) -> NetWorthLineResponse:
    return NetWorthLineResponse(
        source=line.source,
        id=line.source_id,
        name=line.name,
        detail=line.detail,
        amount_cents=line.amount_cents,
        currency=line.currency,
        as_of=line.as_of,
        is_stale=is_stale(line.as_of, today),
        in_total=is_counted(line),
    )


def _total(lines: Iterable[NetWorthLine]) -> int:
    return sum(line.amount_cents or 0 for line in lines if is_counted(line))


def today_point(lines: Sequence[NetWorthLine], today: _dt.date) -> NetWorthHistoryPoint:
    assets = _total(line for line in lines if line.classification == CLASSIFICATION_ASSET)
    liabilities = _total(line for line in lines if line.classification != CLASSIFICATION_ASSET)
    return NetWorthHistoryPoint(
        day=today, assets_cents=assets, liabilities_cents=liabilities, net_cents=assets - liabilities,
    )


def _sort_key(line: NetWorthLine) -> tuple[bool, int, str]:
    # Biggest first; lines waiting for a value go last in their group.
    return (line.amount_cents is None, -abs(line.amount_cents or 0), line.name.lower())


def to_response(lines: Sequence[NetWorthLine], today: _dt.date) -> NetWorthResponse:
    totals = today_point(lines, today)
    groups: list[NetWorthGroupResponse] = []
    for key in NET_WORTH_GROUPS:
        members = sorted((line for line in lines if line.group == key), key=_sort_key)
        if not members:
            continue
        groups.append(NetWorthGroupResponse(
            key=key,
            classification=members[0].classification,
            total_cents=_total(members),
            lines=[line_to_response(line, today) for line in members],
        ))
    return NetWorthResponse(
        currency=NET_WORTH_CURRENCY,
        as_of=today,
        assets_cents=totals.assets_cents,
        liabilities_cents=totals.liabilities_cents,
        net_cents=totals.net_cents,
        groups=groups,
    )


def source_key_of(row: BalanceSnapshot) -> SnapshotSourceKey:
    if row.financial_account_id is not None:
        return SnapshotSourceKey(SOURCE_ACCOUNT, row.financial_account_id)
    if row.mortgage_id is not None:
        return SnapshotSourceKey(SOURCE_MORTGAGE, row.mortgage_id)
    if row.property_id is not None:
        return SnapshotSourceKey(SOURCE_PROPERTY, row.property_id)
    raise ValueError(f"Snapshot {row.id} names no source")


def to_dated_value(row: BalanceSnapshot) -> DatedValue:
    return DatedValue(key=source_key_of(row), day=row.snapshot_date, cents=row.balance_cents)
