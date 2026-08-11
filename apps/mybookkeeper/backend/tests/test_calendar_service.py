"""Service tests for calendar window resolution and source union.

``_resolve_window`` and ``_blackout_sources`` are pure. ``list_events`` is
exercised with the repositories patched — no DB. Verifies:
- both omitted → today → today + DEFAULT_WINDOW_DAYS
- partial supply (only from / only to) → fills the missing side
- inverted ranges raise CalendarWindowError
- window > MAX_WINDOW_DAYS raises CalendarWindowError
- blackouts and leases union into one ordered list
- ``sources`` selects between the two, and skips the query it doesn't need
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.calendar_constants import (
    DEFAULT_WINDOW_DAYS,
    LEASE_SOURCE,
    MAX_WINDOW_DAYS,
)
from app.services.calendar import calendar_service
from app.services.calendar.calendar_service import (
    CalendarWindowError,
    _blackout_sources,
    _resolve_window,
)


class TestCalendarServiceWindow:
    def test_both_omitted_defaults_to_today_plus_window(self) -> None:
        from_, to = _resolve_window(None, None)
        assert from_ == date.today()
        assert (to - from_).days == DEFAULT_WINDOW_DAYS

    def test_only_to_supplied_fills_from(self) -> None:
        explicit_to = date(2026, 12, 31)
        from_, to = _resolve_window(None, explicit_to)
        assert to == explicit_to
        assert (explicit_to - from_).days == DEFAULT_WINDOW_DAYS

    def test_only_from_supplied_fills_to(self) -> None:
        explicit_from = date(2026, 6, 1)
        from_, to = _resolve_window(explicit_from, None)
        assert from_ == explicit_from
        assert (to - explicit_from).days == DEFAULT_WINDOW_DAYS

    def test_both_supplied_passthrough(self) -> None:
        f, t = date(2026, 6, 1), date(2026, 6, 30)
        from_, to = _resolve_window(f, t)
        assert from_ == f
        assert to == t

    def test_inverted_range_raises(self) -> None:
        with pytest.raises(CalendarWindowError):
            _resolve_window(date(2026, 7, 1), date(2026, 6, 1))

    def test_zero_day_window_raises(self) -> None:
        with pytest.raises(CalendarWindowError):
            _resolve_window(date(2026, 7, 1), date(2026, 7, 1))

    def test_window_exactly_at_cap_succeeds(self) -> None:
        f = date(2026, 1, 1)
        t = f + timedelta(days=MAX_WINDOW_DAYS)
        from_, to = _resolve_window(f, t)
        assert (to - from_).days == MAX_WINDOW_DAYS

    def test_window_above_cap_raises(self) -> None:
        f = date(2026, 1, 1)
        t = f + timedelta(days=MAX_WINDOW_DAYS + 1)
        with pytest.raises(CalendarWindowError):
            _resolve_window(f, t)


# Smoke check: re-export sanity (the service is the public interface).
def test_service_exports_window_error() -> None:
    assert calendar_service.CalendarWindowError is CalendarWindowError


class TestBlackoutSourceSplit:
    def test_no_filter_runs_the_blackout_query_unfiltered(self) -> None:
        assert _blackout_sources(None) == (None, True)
        assert _blackout_sources([]) == (None, True)

    def test_lease_is_stripped_from_the_channel_slugs(self) -> None:
        slugs, run = _blackout_sources(["airbnb", LEASE_SOURCE])
        assert slugs == ["airbnb"]
        assert run is True

    def test_leases_only_skips_the_blackout_query(self) -> None:
        slugs, run = _blackout_sources([LEASE_SOURCE])
        assert slugs == []
        assert run is False


_ORG = uuid.uuid4()
_USER = uuid.uuid4()
_NOW = datetime(2026, 8, 9, 12, 0, tzinfo=timezone.utc)


def _blackout_row(listing_title: str, starts_on: date, ends_on: date):
    prop = SimpleNamespace(id=uuid.uuid4(), name="6734 Peerless")
    listing = SimpleNamespace(id=uuid.uuid4(), title=listing_title)
    blackout = SimpleNamespace(
        id=uuid.uuid4(),
        listing_id=listing.id,
        starts_on=starts_on,
        ends_on=ends_on,
        source="airbnb",
        source_event_id="uid-1",
        host_notes=None,
        updated_at=_NOW,
    )
    return blackout, listing, prop


def _lease_row(listing_title: str, starts_on: date, ends_on: date, name: str):
    prop = SimpleNamespace(id=uuid.uuid4(), name="6734 Peerless")
    listing = SimpleNamespace(id=uuid.uuid4(), title=listing_title)
    lease = SimpleNamespace(
        id=uuid.uuid4(), starts_on=starts_on, ends_on=ends_on, updated_at=_NOW,
    )
    return lease, listing, prop, SimpleNamespace(legal_name=name)


def _unlinked_lease_row(starts_on: date, ends_on: date, name: str):
    """A lease the host never attached to a listing.

    ``signed_leases.listing_id`` is nullable, so the repository's outer join
    hands the service ``None`` in both the listing and property slots.
    """
    lease = SimpleNamespace(
        id=uuid.uuid4(), starts_on=starts_on, ends_on=ends_on, updated_at=_NOW,
    )
    return lease, None, None, SimpleNamespace(legal_name=name)


@asynccontextmanager
async def _fake_session():
    yield AsyncMock()


async def _list_events(*, blackouts, leases, sources=None):
    """Run ``list_events`` with both repositories patched.

    Returns ``(events, query_events_mock, query_lease_events_mock)`` so tests
    can assert on which queries ran, not just on the merged output.
    """
    with (
        patch.object(calendar_service, "AsyncSessionLocal", _fake_session),
        patch.object(calendar_service, "calendar_repository") as repo,
        patch.object(
            calendar_service, "listing_blackout_attachment_repo",
        ) as attach_repo,
    ):
        repo.query_events = AsyncMock(return_value=blackouts)
        repo.query_lease_events = AsyncMock(return_value=leases)
        attach_repo.count_by_blackout_ids = AsyncMock(return_value={})
        events = await calendar_service.list_events(
            _ORG,
            _USER,
            from_=date(2026, 8, 1),
            to=date(2026, 9, 1),
            sources=sources,
        )
    return events, repo.query_events, repo.query_lease_events


class TestListEventsUnion:
    @pytest.mark.asyncio
    async def test_returns_both_sources_in_one_ordered_list(self) -> None:
        events, _, _ = await _list_events(
            blackouts=[_blackout_row("B room", date(2026, 8, 20), date(2026, 8, 25))],
            leases=[_lease_row("A room", date(2026, 8, 1), date(2026, 8, 9), "Sonu King")],
        )
        assert [e.source for e in events] == [LEASE_SOURCE, "airbnb"]
        assert [e.listing_name for e in events] == ["A room", "B room"]

    @pytest.mark.asyncio
    async def test_lease_end_is_exclusive_in_the_response(self) -> None:
        events, _, _ = await _list_events(
            blackouts=[],
            leases=[_lease_row("A room", date(2026, 8, 1), date(2026, 8, 9), "Sonu King")],
        )
        assert events[0].ends_on == date(2026, 8, 10)
        assert events[0].summary == "Sonu King"

    @pytest.mark.asyncio
    async def test_lease_only_filter_skips_the_blackout_query(self) -> None:
        events, query_events, query_leases = await _list_events(
            blackouts=[_blackout_row("B room", date(2026, 8, 20), date(2026, 8, 25))],
            leases=[_lease_row("A room", date(2026, 8, 1), date(2026, 8, 9), "Sonu King")],
            sources=[LEASE_SOURCE],
        )
        query_events.assert_not_awaited()
        query_leases.assert_awaited_once()
        assert [e.source for e in events] == [LEASE_SOURCE]

    @pytest.mark.asyncio
    async def test_channel_only_filter_skips_the_lease_query(self) -> None:
        events, query_events, query_leases = await _list_events(
            blackouts=[_blackout_row("B room", date(2026, 8, 20), date(2026, 8, 25))],
            leases=[_lease_row("A room", date(2026, 8, 1), date(2026, 8, 9), "Sonu King")],
            sources=["airbnb"],
        )
        query_events.assert_awaited_once()
        query_leases.assert_not_awaited()
        assert [e.source for e in events] == ["airbnb"]

    @pytest.mark.asyncio
    async def test_lease_slug_is_not_forwarded_to_the_blackout_query(self) -> None:
        _events, query_events, _ = await _list_events(
            blackouts=[],
            leases=[],
            sources=["airbnb", LEASE_SOURCE],
        )
        assert query_events.await_args.kwargs["sources"] == ["airbnb"]


class TestListEventsWithUnlinkedLeases:
    """A tenancy with no listing must reach the response, not vanish."""

    @pytest.mark.asyncio
    async def test_a_lease_with_no_listing_is_returned(self) -> None:
        events, _, _ = await _list_events(
            blackouts=[],
            leases=[
                _unlinked_lease_row(
                    date(2026, 8, 26), date(2026, 10, 3), "Mohammed Awamleh",
                ),
            ],
        )
        assert len(events) == 1
        assert events[0].summary == "Mohammed Awamleh"
        assert events[0].listing_id is None
        assert events[0].listing_name is None
        assert events[0].property_id is None
        assert events[0].property_name is None
        # The end-date convention still applies to an unlinked lease.
        assert events[0].ends_on == date(2026, 10, 4)

    @pytest.mark.asyncio
    async def test_unlinked_leases_sort_after_everything_with_a_listing(self) -> None:
        events, _, _ = await _list_events(
            blackouts=[_blackout_row("Z room", date(2026, 8, 20), date(2026, 8, 25))],
            leases=[
                _unlinked_lease_row(date(2026, 8, 1), date(2026, 8, 9), "Andrew Le"),
                _lease_row("A room", date(2026, 8, 3), date(2026, 8, 9), "Sonu King"),
            ],
        )
        assert [e.summary for e in events] == ["Sonu King", None, "Andrew Le"]
        assert events[-1].listing_name is None

    @pytest.mark.asyncio
    async def test_mixed_linked_and_unlinked_leases_all_survive(self) -> None:
        """The regression this class exists for: 4 leases in, 4 leases out."""
        events, _, _ = await _list_events(
            blackouts=[],
            leases=[
                _lease_row("A room", date(2026, 5, 3), date(2026, 11, 10), "Sonu King"),
                _lease_row("A room", date(2026, 5, 30), date(2026, 8, 9), "Prince Kapoor"),
                _unlinked_lease_row(date(2026, 8, 26), date(2026, 10, 3), "Mohammed Awamleh"),
                _unlinked_lease_row(date(2026, 5, 30), date(2026, 8, 9), "Andrew Le"),
            ],
        )
        assert len(events) == 4
        assert sorted(e.summary for e in events) == [
            "Andrew Le",
            "Mohammed Awamleh",
            "Prince Kapoor",
            "Sonu King",
        ]
