"""Unit tests for the iCal poll service.

Uses a real ``httpx.AsyncClient`` over ``httpx.MockTransport`` so no real
network calls fire, and stubs DNS for the SSRF guard. Patches
``unit_of_work`` so the service writes through the test fixture's
in-memory SQLite session instead of the production engine.

Verifies:
- Insert when feed has new VEVENT
- Update in place when UID re-seen with new dates
- Delete when UID disappears from feed
- HTTP failure preserves existing rows + records last_import_error
- Error category branching: transient / auth / config / unknown
- SSRF guard: ``ical_import_url`` is user-supplied, so ``_fetch`` must
  reject internal / non-public targets (loopback, cloud metadata,
  disallowed scheme/port) on the first hop AND re-validate every redirect
  hop, and ``poll_one`` must record a blocked URL as category ``config``.
"""
from __future__ import annotations

import asyncio
import ipaddress
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import httpx
import pytest

from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core import url_safety
from platform_shared.core.url_safety import UnsafeURLError
from platform_shared.testing.streamed_response import streamed_response

from app.core.ical_feed_constants import ICAL_FEED_MAX_BYTES, ICAL_FEED_MAX_REDIRECTS

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


_PUBLIC_STUB_IP = "93.184.216.34"

# Kept before the autouse fixture below replaces it, for the one test that
# needs the real resolver's handling of a malformed name.
_REAL_RESOLVE_HOST = url_safety._resolve_host


def _resolve_for_tests(
    host: str, port: int
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Literal IPs are classified for real; hostnames resolve to a public IP."""
    try:
        return [ipaddress.ip_address(host)]
    except ValueError:
        return [ipaddress.ip_address(_PUBLIC_STUB_IP)]


@pytest.fixture(autouse=True)
def _stub_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "platform_shared.core.url_safety._resolve_host", _resolve_for_tests,
    )


Responder = Callable[[httpx.Request], httpx.Response]


class _FeedClient(httpx.AsyncClient):
    """A real ``httpx.AsyncClient`` over ``MockTransport``.

    Streaming, redirects and timeouts all run through httpx itself, so the
    tests exercise the real fetch path. ``urls`` records every request sent.
    """

    def __init__(self, respond: Responder) -> None:
        self.urls: list[str] = []

        def handle(request: httpx.Request) -> httpx.Response:
            self.urls.append(str(request.url))
            return respond(request)

        super().__init__(transport=httpx.MockTransport(handle))


def _mock_client_returning(payload: bytes) -> _FeedClient:
    return _FeedClient(lambda request: streamed_response(200, content=payload))


def _mock_client_raising(exc: Exception) -> _FeedClient:
    def respond(request: httpx.Request) -> httpx.Response:
        raise exc

    return _FeedClient(respond)


def _mock_client_status(status_code: int) -> _FeedClient:
    return _FeedClient(lambda request: httpx.Response(status_code))


def _resp(
    status_code: int, *, content: bytes = b"", location: str | None = None,
) -> httpx.Response:
    headers = {"location": location} if location is not None else {}
    return streamed_response(status_code, content=content, headers=headers)


def _mock_client_sequence(responses: list[httpx.Response]) -> _FeedClient:
    """Client whose successive requests get ``responses`` in order."""
    remaining = list(responses)
    return _FeedClient(lambda request: remaining.pop(0))


async def _endless(chunk: bytes, *, pause: float = 0.0) -> AsyncIterator[bytes]:
    while True:
        if pause:
            await asyncio.sleep(pause)
        yield chunk


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
        assert refreshed.last_import_error_category == "transient"

    @pytest.mark.asyncio
    async def test_request_error_recorded_as_transient(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(
                cl, client=_mock_client_raising(httpx.ConnectTimeout("connect timed out")),
            )

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "transient"
        assert refreshed.last_import_error is not None

    @pytest.mark.asyncio
    async def test_http_401_recorded_as_auth(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=_mock_client_status(401))

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "auth"

    @pytest.mark.asyncio
    async def test_http_403_recorded_as_auth(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=_mock_client_status(403))

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "auth"

    @pytest.mark.asyncio
    async def test_http_400_recorded_as_config(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=_mock_client_status(400))

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "config"

    @pytest.mark.asyncio
    async def test_http_503_recorded_as_transient(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=_mock_client_status(503))

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "transient"

    @pytest.mark.asyncio
    async def test_unexpected_exception_recorded_as_unknown(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(
                cl, client=_mock_client_raising(RuntimeError("unexpected parse failure")),
            )

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "unknown"
        assert refreshed.last_import_error is not None

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

        assert client.urls == []


class TestFetchSSRFGuard:
    """``_fetch`` must never egress to a non-public target.

    The URLs below are literal IPs / non-http schemes, so the real
    ``assert_url_safe`` runs without any network DNS lookup — the guard is
    exercised for real, not mocked.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/internal-only",  # loopback
            "http://169.254.169.254/latest/meta-data/",  # cloud metadata
            "file:///etc/passwd",  # disallowed scheme (local file read)
            "http://8.8.8.8:9000/service",  # public IP, disallowed port
        ],
    )
    async def test_first_hop_unsafe_url_blocked_before_egress(self, url) -> None:
        client = _mock_client_sequence([])  # .get must never be reached
        with pytest.raises(UnsafeURLError):
            await channel_sync_service._fetch(url, client=client)
        assert client.urls == []

    @pytest.mark.asyncio
    async def test_redirect_into_internal_target_blocked(self) -> None:
        # Public first hop (8.8.8.8:80 passes) that 302s to loopback. The
        # per-hop re-validation must reject the redirect before issuing it.
        client = _mock_client_sequence(
            [_resp(302, location="http://127.0.0.1/internal-only")]
        )
        with pytest.raises(UnsafeURLError):
            await channel_sync_service._fetch("http://8.8.8.8/cal.ics", client=client)
        # First (public) request issued; the internal redirect never was.
        assert client.urls == ["http://8.8.8.8/cal.ics"]

    @pytest.mark.asyncio
    async def test_redirect_loop_trips_cap(self) -> None:
        # Always redirect to a public literal so every hop passes the SSRF
        # guard but the redirect cap eventually trips.
        client = _FeedClient(
            lambda request: _resp(302, location="http://8.8.8.8/next")
        )
        with pytest.raises(CappedFetchError) as exc_info:
            await channel_sync_service._fetch("http://8.8.8.8/start", client=client)
        assert exc_info.value.reason == "too_many_redirects"
        assert len(client.urls) == ICAL_FEED_MAX_REDIRECTS + 1

    @pytest.mark.asyncio
    async def test_oversized_body_rejected(self) -> None:
        big = b"x" * (ICAL_FEED_MAX_BYTES + 1)
        client = _mock_client_sequence([_resp(200, content=big)])
        with pytest.raises(CappedFetchError) as exc_info:
            await channel_sync_service._fetch("http://8.8.8.8/cal.ics", client=client)
        assert exc_info.value.reason == "too_large"


class TestFetchLimits:
    """The feed fetch has one overall deadline and stops reading at the cap.

    ``poll_all`` polls feeds one at a time, so a single slow or huge feed
    would otherwise stall blackout sync for every other listing.
    """

    @pytest.mark.asyncio
    async def test_endless_feed_stops_at_the_cap(self) -> None:
        # Buffering the whole body first would never finish here.
        client = _FeedClient(
            lambda request: httpx.Response(200, content=_endless(b"x" * 65_536))
        )
        with pytest.raises(CappedFetchError) as exc_info:
            await asyncio.wait_for(
                channel_sync_service._fetch("http://8.8.8.8/cal.ics", client=client),
                timeout=10,
            )
        assert exc_info.value.reason == "too_large"

    @pytest.mark.asyncio
    async def test_slow_drip_feed_hits_the_overall_deadline(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Every chunk arrives far inside the per-read timeout; only an overall
        # deadline ends this.
        monkeypatch.setattr(channel_sync_service, "ICAL_FEED_TOTAL_TIMEOUT_SECONDS", 0.3)
        client = _FeedClient(
            lambda request: httpx.Response(200, content=_endless(b"x", pause=0.05))
        )
        with pytest.raises(CappedFetchError) as exc_info:
            await asyncio.wait_for(
                channel_sync_service._fetch("http://8.8.8.8/cal.ics", client=client),
                timeout=5,
            )
        assert exc_info.value.reason == "timeout"

    @pytest.mark.asyncio
    async def test_stalled_feed_recorded_as_transient_without_the_url(
        self, db, seeded_channel_listing, monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        monkeypatch.setattr(channel_sync_service, "ICAL_FEED_TOTAL_TIMEOUT_SECONDS", 0.3)
        cl = seeded_channel_listing
        client = _FeedClient(
            lambda request: httpx.Response(200, content=_endless(b"x", pause=0.05))
        )
        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=client)

        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None
        assert refreshed.last_import_error_category == "transient"
        assert refreshed.last_import_error is not None
        assert "airbnb.com" in refreshed.last_import_error
        assert "cal.ics" not in refreshed.last_import_error
        assert "cal.ics" not in caplog.text


class TestPollOneBlocksSSRF:
    @pytest.mark.asyncio
    async def test_blocked_url_recorded_as_config(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        await channel_listing_repo.update(
            db, cl.id, cl.listing_id,
            {"ical_import_url": "http://169.254.169.254/latest/meta-data/"},
        )
        await db.commit()
        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None

        client = _mock_client_returning(b"")  # must never egress
        with _patched_uow(db):
            await channel_sync_service.poll_one(refreshed, client=client)

        assert client.urls == []
        after = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert after is not None
        assert after.last_import_error_category == "config"
        assert after.last_import_error is not None
        assert "UnsafeURLError" in after.last_import_error


class TestPollOneLogsRedactedFeed:
    """The feed URL is a secret: log lines carry only its redacted form (host and hash)."""

    @pytest.mark.asyncio
    async def test_unsafe_url_logs_redacted_feed_not_url(
        self, db, seeded_channel_listing, caplog: pytest.LogCaptureFixture,
    ) -> None:
        cl = seeded_channel_listing
        await channel_listing_repo.update(
            db, cl.id, cl.listing_id,
            {"ical_import_url": "http://127.0.0.1/private/secret-feed-token.ics"},
        )
        await db.commit()
        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None

        with _patched_uow(db):
            await channel_sync_service.poll_one(refreshed, client=_mock_client_returning(b""))

        assert "url=127.0.0.1#" in caplog.text
        assert "secret-feed-token" not in caplog.text

    @pytest.mark.asyncio
    async def test_unknown_error_logs_redacted_feed_not_url(
        self, db, seeded_channel_listing, caplog: pytest.LogCaptureFixture,
    ) -> None:
        cl = seeded_channel_listing
        with _patched_uow(db):
            await channel_sync_service.poll_one(
                cl, client=_mock_client_raising(RuntimeError("unexpected parse failure")),
            )

        assert "url=airbnb.com#" in caplog.text
        assert "cal.ics" not in caplog.text

    @pytest.mark.asyncio
    async def test_malformed_hostname_recorded_as_config(
        self, db, seeded_channel_listing, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # The IDNA codec rejects ``a..b`` before any lookup; that must be an
        # unsafe-URL config error, not an exception out of the poll loop.
        cl = seeded_channel_listing
        await channel_listing_repo.update(
            db, cl.id, cl.listing_id, {"ical_import_url": "https://a..b/cal.ics"},
        )
        await db.commit()
        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None

        monkeypatch.setattr(
            "platform_shared.core.url_safety._resolve_host", _REAL_RESOLVE_HOST,
        )
        with _patched_uow(db):
            await channel_sync_service.poll_one(refreshed, client=_mock_client_returning(b""))

        after = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert after is not None
        assert after.last_import_error_category == "config"

    @pytest.mark.asyncio
    async def test_unsupported_encoding_recorded_as_config(
        self, db, seeded_channel_listing,
    ) -> None:
        cl = seeded_channel_listing
        client = _FeedClient(
            lambda request: streamed_response(
                200, content=b"...", headers={"content-encoding": "br"},
            )
        )
        with _patched_uow(db):
            await channel_sync_service.poll_one(cl, client=client)

        after = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert after is not None
        assert after.last_import_error_category == "config"
