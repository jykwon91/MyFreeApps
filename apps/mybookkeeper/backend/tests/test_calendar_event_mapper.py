"""Tests for calendar row → event conversion.

The interesting case is the end-date convention. ``CalendarEventResponse``
promises an EXCLUSIVE ``ends_on`` (iCal RFC 5545) but ``SignedLease.ends_on``
is INCLUSIVE, so the mapper is the one place that bridges them. Getting this
wrong renders every tenancy a day short.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.core.calendar_constants import LEASE_SOURCE
from app.mappers.calendar_event_mapper import (
    UNNAMED_TENANT_LABEL,
    blackout_to_event,
    event_sort_key,
    lease_to_event,
)

_NOW = datetime(2026, 8, 9, 12, 0, tzinfo=timezone.utc)


def _listing(title: str = "Room A") -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), title=title)


def _property(name: str = "6734 Peerless") -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), name=name)


def _lease(starts_on: date, ends_on: date) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(), starts_on=starts_on, ends_on=ends_on, updated_at=_NOW,
    )


def _blackout(starts_on: date, ends_on: date, source: str = "airbnb") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        starts_on=starts_on,
        ends_on=ends_on,
        source=source,
        source_event_id="uid-123",
        host_notes="left key under mat",
        updated_at=_NOW,
    )


class TestLeaseToEvent:
    def test_inclusive_lease_end_becomes_exclusive_event_end(self) -> None:
        """A lease running through Aug 9 must cover Aug 9, so ends_on is Aug 10."""
        event = lease_to_event(
            _lease(date(2026, 5, 3), date(2026, 8, 9)),
            _listing(),
            _property(),
            SimpleNamespace(legal_name="Sonu King"),
        )
        assert event.starts_on == date(2026, 5, 3)
        assert event.ends_on == date(2026, 8, 10)

    def test_single_day_lease_spans_one_day(self) -> None:
        event = lease_to_event(
            _lease(date(2026, 8, 9), date(2026, 8, 9)),
            _listing(),
            _property(),
            SimpleNamespace(legal_name="Sonu King"),
        )
        assert (event.ends_on - event.starts_on).days == 1

    def test_carries_the_tenant_name_as_summary(self) -> None:
        event = lease_to_event(
            _lease(date(2026, 5, 3), date(2026, 8, 9)),
            _listing(),
            _property(),
            SimpleNamespace(legal_name="Sonu King"),
        )
        assert event.summary == "Sonu King"
        assert event.source == LEASE_SOURCE

    def test_unnamed_tenant_falls_back_to_a_label(self) -> None:
        event = lease_to_event(
            _lease(date(2026, 5, 3), date(2026, 8, 9)),
            _listing(),
            _property(),
            SimpleNamespace(legal_name=None),
        )
        assert event.summary == UNNAMED_TENANT_LABEL

    def test_exposes_no_editable_blackout_fields(self) -> None:
        """Notes/attachments are blackout-keyed; a lease event has neither."""
        event = lease_to_event(
            _lease(date(2026, 5, 3), date(2026, 8, 9)),
            _listing(),
            _property(),
            SimpleNamespace(legal_name="Sonu King"),
        )
        assert event.host_notes is None
        assert event.attachment_count == 0
        assert event.source_event_id is None

    def test_uses_the_listing_from_the_join_not_the_lease(self) -> None:
        listing = _listing("Room B")
        prop = _property("Elsewhere")
        event = lease_to_event(
            _lease(date(2026, 5, 3), date(2026, 8, 9)),
            listing,
            prop,
            SimpleNamespace(legal_name="Sonu King"),
        )
        assert event.listing_id == listing.id
        assert event.listing_name == "Room B"
        assert event.property_id == prop.id
        assert event.property_name == "Elsewhere"

    def test_maps_a_lease_with_no_listing_instead_of_refusing(self) -> None:
        """``signed_leases.listing_id`` is nullable — the tenancy is still real."""
        event = lease_to_event(
            _lease(date(2026, 8, 26), date(2026, 10, 3)),
            None,
            None,
            SimpleNamespace(legal_name="Mohammed Awamleh"),
        )
        assert event.listing_id is None
        assert event.listing_name is None
        assert event.property_id is None
        assert event.property_name is None
        # Everything that makes the event useful still survives.
        assert event.summary == "Mohammed Awamleh"
        assert event.starts_on == date(2026, 8, 26)
        assert event.ends_on == date(2026, 10, 4)
        assert event.source == LEASE_SOURCE


class TestBlackoutToEvent:
    def test_passes_the_exclusive_end_through_untouched(self) -> None:
        blackout = _blackout(date(2026, 8, 1), date(2026, 8, 10))
        event = blackout_to_event(blackout, _listing(), _property(), 2)
        assert event.starts_on == date(2026, 8, 1)
        assert event.ends_on == date(2026, 8, 10)

    def test_carries_channel_metadata_and_attachment_count(self) -> None:
        blackout = _blackout(date(2026, 8, 1), date(2026, 8, 10))
        event = blackout_to_event(blackout, _listing(), _property(), 3)
        assert event.source == "airbnb"
        assert event.source_event_id == "uid-123"
        assert event.host_notes == "left key under mat"
        assert event.attachment_count == 3
        # iCal gives no guest name — the detail dialog keys its hint off this.
        assert event.summary is None


class TestEventSortKey:
    def test_orders_by_property_then_listing_then_start(self) -> None:
        prop_a, prop_b = _property("A prop"), _property("B prop")
        listing_x, listing_y = _listing("X room"), _listing("Y room")
        applicant = SimpleNamespace(legal_name="T")

        events = [
            lease_to_event(_lease(date(2026, 8, 5), date(2026, 8, 9)), listing_y, prop_b, applicant),
            lease_to_event(_lease(date(2026, 8, 3), date(2026, 8, 9)), listing_x, prop_a, applicant),
            lease_to_event(_lease(date(2026, 8, 1), date(2026, 8, 9)), listing_y, prop_a, applicant),
            blackout_to_event(_blackout(date(2026, 8, 2), date(2026, 8, 4)), listing_x, prop_a, 0),
        ]
        ordered = sorted(events, key=event_sort_key)

        assert [(e.property_name, e.listing_name, e.starts_on) for e in ordered] == [
            ("A prop", "X room", date(2026, 8, 2)),
            ("A prop", "X room", date(2026, 8, 3)),
            ("A prop", "Y room", date(2026, 8, 1)),
            ("B prop", "Y room", date(2026, 8, 5)),
        ]

    def test_interleaves_leases_and_blackouts_on_the_same_listing(self) -> None:
        """The union must not arrive as two separate blocks."""
        prop, listing = _property(), _listing()
        applicant = SimpleNamespace(legal_name="T")
        events = [
            blackout_to_event(_blackout(date(2026, 8, 10), date(2026, 8, 12)), listing, prop, 0),
            lease_to_event(_lease(date(2026, 8, 1), date(2026, 8, 5)), listing, prop, applicant),
            blackout_to_event(_blackout(date(2026, 8, 6), date(2026, 8, 8)), listing, prop, 0),
        ]
        ordered = sorted(events, key=event_sort_key)
        assert [e.source for e in ordered] == [LEASE_SOURCE, "airbnb", "airbnb"]

    def test_sorts_listing_less_leases_last_without_raising(self) -> None:
        """``None`` and ``str`` are not orderable — the key must rank null-ness."""
        applicant = SimpleNamespace(legal_name="T")
        events = [
            lease_to_event(_lease(date(2026, 8, 1), date(2026, 8, 9)), None, None, applicant),
            lease_to_event(
                _lease(date(2026, 8, 1), date(2026, 8, 9)),
                _listing("Z room"),
                _property("Z prop"),
                applicant,
            ),
        ]
        ordered = sorted(events, key=event_sort_key)
        assert [e.property_name for e in ordered] == ["Z prop", None]
