"""The response the net worth page reads — the mapper seam, tested directly.

Pinned: groups come in display order with empty ones left out; a group adds
up only counted lines; lines waiting for a value sort last; staleness is
strictly past ``STALE_AFTER_DAYS``; a snapshot row maps to its one source.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest

from app.core.net_worth_constants import (
    GROUP_CASH,
    GROUP_CREDIT_CARDS,
    GROUP_PROPERTY,
    SOURCE_ACCOUNT,
    SOURCE_PROPERTY,
    STALE_AFTER_DAYS,
)
from app.mappers import net_worth_mapper
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.services.net_worth.net_worth_line import NetWorthLine
from app.services.net_worth.snapshot_source_key import SnapshotSourceKey

_TODAY = _dt.date(2026, 11, 24)


def _line(group: str, amount: int | None, *, classification: str = "asset", name: str = "x", currency: str = "USD", as_of: _dt.date | None = _TODAY) -> NetWorthLine:
    return NetWorthLine(
        source=SOURCE_ACCOUNT, source_id=uuid.uuid4(), name=name, detail=None, group=group,
        classification=classification, currency=currency, amount_cents=amount,
        as_of=as_of if amount is not None else None,
    )


def test_groups_follow_display_order_and_totals_count_only_counted_lines() -> None:
    lines = [
        _line(GROUP_CREDIT_CARDS, 300, classification="liability"),
        _line(GROUP_CASH, 1_000),
        _line(GROUP_CASH, 500, currency="EUR"),
        _line(GROUP_PROPERTY, None),
    ]
    res = net_worth_mapper.to_response(lines, _TODAY)
    assert [g.key for g in res.groups] == [GROUP_CASH, GROUP_PROPERTY, GROUP_CREDIT_CARDS]
    assert res.groups[0].total_cents == 1_000
    assert [line.in_total for line in res.groups[0].lines] == [True, False]
    assert (res.assets_cents, res.liabilities_cents, res.net_cents) == (1_000, 300, 700)


def test_lines_waiting_for_a_value_sort_last_biggest_first_otherwise() -> None:
    lines = [_line(GROUP_CASH, None, name="a"), _line(GROUP_CASH, 5, name="b"), _line(GROUP_CASH, -50, name="c")]
    [group] = net_worth_mapper.to_response(lines, _TODAY).groups
    assert [line.name for line in group.lines] == ["c", "b", "a"]


@pytest.mark.parametrize(
    ("age_days", "stale"),
    [(STALE_AFTER_DAYS, False), (STALE_AFTER_DAYS + 1, True)],
)
def test_staleness_is_strictly_past_the_limit(age_days: int, stale: bool) -> None:
    line = _line(GROUP_CASH, 1, as_of=_TODAY - _dt.timedelta(days=age_days))
    assert net_worth_mapper.line_to_response(line, _TODAY).is_stale is stale


def test_nothing_to_show_is_an_empty_group_list() -> None:
    res = net_worth_mapper.to_response([], _TODAY)
    assert res.groups == []
    assert res.net_cents == 0


def test_a_snapshot_maps_to_its_one_source() -> None:
    prop_id = uuid.uuid4()
    row = BalanceSnapshot(property_id=prop_id, snapshot_date=_TODAY, balance_cents=42)
    value = net_worth_mapper.to_dated_value(row)
    assert value.key == SnapshotSourceKey(SOURCE_PROPERTY, prop_id)
    assert (value.day, value.cents) == (_TODAY, 42)


def test_a_snapshot_with_no_source_fails_loud() -> None:
    with pytest.raises(ValueError):
        net_worth_mapper.source_key_of(BalanceSnapshot(snapshot_date=_TODAY, balance_cents=1))
