"""Tests for the rent-receipt period defaulting.

The receipt period used to default to the whole calendar month of the
payment regardless of the lease, so a move-out month overstated coverage
("Aug 1 – Aug 31" for a tenant whose term ended Aug 9). These cover the
clipping that fixes that, plus the lease-selection it depends on.

Repository calls are patched — no DB connection required.
"""
from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.leases.receipt_formatting import clamp_period_to_term
from app.services.leases.receipt_period_resolver import resolve_lease_and_period


def _lease(
    starts_on: date | None,
    ends_on: date | None,
    lease_id: uuid.UUID | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=lease_id or uuid.uuid4(), starts_on=starts_on, ends_on=ends_on,
    )


# ---------------------------------------------------------------------------
# clamp_period_to_term — pure
# ---------------------------------------------------------------------------

def test_clamps_end_to_move_out_date() -> None:
    """The reported bug: term ends mid-month, receipt claimed the whole month."""
    start, end = clamp_period_to_term(
        date(2026, 8, 1),
        date(2026, 8, 31),
        term_start=date(2026, 5, 3),
        term_end=date(2026, 8, 9),
    )
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 9))


def test_clamps_start_to_move_in_date() -> None:
    start, end = clamp_period_to_term(
        date(2026, 8, 1),
        date(2026, 8, 31),
        term_start=date(2026, 8, 15),
        term_end=date(2027, 2, 14),
    )
    assert (start, end) == (date(2026, 8, 15), date(2026, 8, 31))


def test_leaves_period_alone_when_term_spans_the_whole_month() -> None:
    start, end = clamp_period_to_term(
        date(2026, 8, 1),
        date(2026, 8, 31),
        term_start=date(2026, 5, 3),
        term_end=date(2026, 11, 10),
    )
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))


def test_term_end_on_the_last_day_of_the_month_is_inclusive() -> None:
    """Terms are inclusive on both ends — Aug 31 still covers Aug 31."""
    start, end = clamp_period_to_term(
        date(2026, 8, 1),
        date(2026, 8, 31),
        term_start=date(2026, 8, 1),
        term_end=date(2026, 8, 31),
    )
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))


@pytest.mark.parametrize(
    ("term_start", "term_end"),
    [
        (None, date(2026, 8, 9)),
        (date(2026, 8, 15), None),
        (None, None),
    ],
)
def test_open_ended_bounds_do_not_clip(
    term_start: date | None, term_end: date | None,
) -> None:
    start, end = clamp_period_to_term(
        date(2026, 8, 1), date(2026, 8, 31),
        term_start=term_start, term_end=term_end,
    )
    expected_start = term_start or date(2026, 8, 1)
    expected_end = term_end or date(2026, 8, 31)
    assert (start, end) == (expected_start, expected_end)


def test_non_overlapping_term_returns_the_period_unchanged() -> None:
    """A payment dated outside the lease must not produce an inverted range."""
    start, end = clamp_period_to_term(
        date(2026, 9, 1),
        date(2026, 9, 30),
        term_start=date(2026, 5, 3),
        term_end=date(2026, 8, 9),
    )
    assert (start, end) == (date(2026, 9, 1), date(2026, 9, 30))


# ---------------------------------------------------------------------------
# resolve_lease_and_period — orchestration
# ---------------------------------------------------------------------------

_IDS = {
    "user_id": uuid.uuid4(),
    "organization_id": uuid.uuid4(),
    "applicant_id": uuid.uuid4(),
}


async def _resolve(covering, newest=None, **overrides):
    with patch(
        "app.services.leases.receipt_period_resolver.signed_lease_repo",
    ) as repo:
        repo.get_covering_date = AsyncMock(return_value=covering)
        repo.list_for_tenant = AsyncMock(
            return_value=[newest] if newest is not None else [],
        )
        result = await resolve_lease_and_period(
            AsyncMock(),
            **_IDS,
            txn_date=overrides.pop("txn_date", date(2026, 8, 5)),
            **overrides,
        )
    return result


@pytest.mark.asyncio
async def test_default_period_is_clipped_to_the_covering_lease() -> None:
    lease = _lease(date(2026, 5, 3), date(2026, 8, 9))
    lease_id, start, end = await _resolve(lease)
    assert lease_id == lease.id
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 9))


@pytest.mark.asyncio
async def test_explicit_period_from_the_host_is_never_clipped() -> None:
    """The host may deliberately issue a receipt outside the lease term."""
    lease = _lease(date(2026, 5, 3), date(2026, 8, 9))
    lease_id, start, end = await _resolve(
        lease,
        period_start_date=date(2026, 8, 1),
        period_end_date=date(2026, 8, 31),
    )
    assert lease_id == lease.id
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))


@pytest.mark.asyncio
async def test_falls_back_to_the_newest_lease_when_none_covers_the_date() -> None:
    newest = _lease(date(2026, 9, 1), date(2027, 2, 28))
    lease_id, start, end = await _resolve(None, newest=newest)
    assert lease_id == newest.id
    # The fallback lease does not cover August, so clipping is a no-op.
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))


@pytest.mark.asyncio
async def test_prefers_the_covering_lease_over_the_newest_one() -> None:
    """A payment under a parent lease must not adopt its successor's term."""
    parent = _lease(date(2026, 5, 3), date(2026, 8, 9))
    successor = _lease(date(2026, 8, 10), date(2027, 2, 9))
    lease_id, start, end = await _resolve(parent, newest=successor)
    assert lease_id == parent.id
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 9))


@pytest.mark.asyncio
async def test_no_lease_at_all_keeps_the_plain_calendar_month() -> None:
    lease_id, start, end = await _resolve(None)
    assert lease_id is None
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))
