"""Unit tests for the iCal poll service.

Mocks ``httpx.AsyncClient`` so no real network calls fire. Patches
``unit_of_work`` so the service writes through the test fixture's
in-memory SQLite session instead of the production engine.

Verifies:
- Insert when feed has new VEVENT
- Update in place when UID re-seen with new dates
- Delete when UID disappears from feed
- HTTP failure preserves existing rows + records last_import_error
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.listings.channel import Channel
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.properties.property import Property
from app.repositories import channel_listing_repo, listing_blackout_repo
from app.services.listings import channel_sync_service


@asynccontextmanager
async def _identity_uow(session):
    """Patch target — yield the already-open test session unchanged.

    The real ``unit_of_work`` opens a session-scoped transaction; the
    test session is already in one (driven by the conftest fixture), so
    we just yield it as-is.
    """
    yield session


@pytest.fixture()
async def seeded_channel_listing(db, test_user, test_org) -> ChannelListing:
    """Seed a channel + listing + channel_listing for poll testing."""
    db.add(
        Channel(
            id="airbnb", name="Airbnb",
            supports_ical_export=True, supports_ical_import=True,
        )
    )
    prop = Property(
        organization_id=test_org.id, user_id=test_user.id,
        name="Test", address="100 Test Dr",
    )
    db.add(prop)
    await db.flush()

    listing = Listing(
        id=uuid.uuid4(),
        organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        title="Test", monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        private_bath=False, parking_assigned=False, furnished=True,
        status="active", amenities=[], pets_on_premises=False,
    )
    db.add(listing)
    await db.flush()

    cl = await channel_listing_repo.create(
        db,
        listing_id=listing.id, channel_id="airbnb",
        external_url="https://airbnb.com/x", external_id=None,
        ical_import_url="https://airbnb.com/cal.ics",
        ical_import_secret_token=None,
    )
    await db.commit()
    return cl


def _ical(events: str) -> bytes:
    return (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Test//Test//EN\r\n"
        f"{events}"
        "END:VCALENDAR\r\n"
    ).encode()


def _vevent(uid: str, start: str, end: str) -> str:
    return (
        "BEGIN:VEVENT\r\n"
        f"UID:{uid}\r\n"
        f"DTSTART;VALUE=DATE:{start}\r\n"
        f"DTEND;VALUE=DATE:{end}\r\n"
        "DTSTAMP:20260429T120000Z\r\n"
        "SUMMARY:Reserved\r\n"
        "END:VEVENT\r\n"
    )


def _mock_client_returning(payload: bytes) -> AsyncMock:
    """Build an AsyncMock client whose .get() resolves to a 200 response."""
    response = MagicMock()
    response.content = payload
    response.raise_for_status = MagicMock(return_value=None)

    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=response)
    return client


def _mock_client_raising(exc: Exception) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=exc)
    return client


def _patched_uow(session):
    """Build a patch for ``channel_sync_service.unit_of_work`` that yields ``session``."""
    return patch(
        "app.services.listings.channel_sync_service.unit_of_work",
        lambda: _identity_uow(session),
    )


class TestPollOne:
    @pytest.mark.asyncio
    async def test_inserts_new_blackout(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        payload = _ical(_vevent("uid-1", "20260615", "20260620"))
        client = _mock_client_returning(payload)

        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=client)

        rows = await listing_blackout_repo.list_by_listing(db, cl.listing_id)
        assert len(rows) == 1
        assert rows[0].source == "airbnb"
        assert rows[0].source_event_id == "uid-1"
        assert rows[0].starts_on == date(2026, 6, 15)
        assert rows[0].ends_on == date(2026, 6, 20)

    @pytest.mark.asyncio
    async def test_updates_existing_when_dates_change(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(
                cl, client=_mock_client_returning(_ical(_vevent("uid-1", "20260615", "20260620"))),
            )
            await channel_sync_service.poll_one(
                cl, client=_mock_client_returning(_ical(_vevent("uid-1", "20260618", "20260623"))),
            )

        rows = await listing_blackout_repo.list_by_listing(db, cl.listing_id)
        assert len(rows) == 1
        assert rows[0].starts_on == date(2026, 6, 18)
        assert rows[0].ends_on == date(2026, 6, 23)

    @pytest.mark.asyncio
    async def test_deletes_blackout_when_uid_disappears(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(
                cl,
                client=_mock_client_returning(
                    _ical(
                        _vevent("uid-keep", "20260615", "20260620")
                        + _vevent("uid-cancel", "20260701", "20260705"),
                    )
                ),
            )
            await channel_sync_service.poll_one(
                cl,
                client=_mock_client_returning(_ical(_vevent("uid-keep", "20260615", "20260620"))),
            )

        rows = await listing_blackout_repo.list_by_listing(db, cl.listing_id)
        assert len(rows) == 1
        assert rows[0].source_event_id == "uid-keep"

    @pytest.mark.asyncio
    async def test_http_failure_preserves_existing_rows(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(
                cl,
                client=_mock_client_returning(_ical(_vevent("uid-1", "20260615", "20260620"))),
            )
            await channel_sync_service.poll_one(
                cl, client=_mock_client_raising(httpx.ConnectTimeout("timeout")),
            )

        rows = await listing_blackout_repo.list_by_listing(db, cl.listing_id)
        assert len(rows) == 1
        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error is not None
        assert "timeout" in refreshed.last_import_error.lower()

    @pytest.mark.asyncio
    async def test_skip_when_url_is_none(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        await channel_listing_repo.update(
            db, cl.id, cl.listing_id, {"ical_import_url": None},
        )
        await db.commit()

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None

        client = _mock_client_returning(b"")
        with _patched_uow(db):
            await channel_sync_service.poll_one(refreshed, client=client)

        client.get.assert_not_called()
