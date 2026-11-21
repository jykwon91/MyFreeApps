"""Secret calendar feed links must never reach logs, Sentry or last_import_error."""
from __future__ import annotations

import logging

import httpx
import pytest

from app.core.url_redaction import redact_url, redact_urls_in_text
from app.repositories import channel_listing_repo
from app.services.listings import channel_sync_service
from tests.test_channel_sync_service import (  # noqa: F401 — fixture re-export
    _patched_uow,
    _mock_client_raising,
    seeded_channel_listing,
)

SECRET = "s3cr3t-calendar-token-9f8e7d"
FEED_URL = f"https://www.airbnb.com/calendar/ical/12345.ics?s={SECRET}"


class TestRedactUrl:
    def test_keeps_host_drops_path_and_query(self) -> None:
        redacted = redact_url(FEED_URL)
        assert redacted.startswith("www.airbnb.com#")
        assert SECRET not in redacted
        assert "12345" not in redacted
        assert "?" not in redacted and "/" not in redacted

    def test_distinct_urls_get_distinct_ids(self) -> None:
        assert redact_url(FEED_URL) != redact_url(FEED_URL + "x")

    def test_same_url_is_stable(self) -> None:
        assert redact_url(FEED_URL) == redact_url(FEED_URL)

    def test_userinfo_is_dropped(self) -> None:
        assert "hunter2" not in redact_url("https://user:hunter2@example.com/a")

    def test_unparseable_url_does_not_raise_or_leak(self) -> None:
        redacted = redact_url("http://[" + SECRET)
        assert SECRET not in redacted


class TestRedactUrlsInText:
    def test_httpx_status_message_is_redacted(self) -> None:
        text = f"Client error '404 Not Found' for url '{FEED_URL}'\nFor more information..."
        out = redact_urls_in_text(text)
        assert SECRET not in out
        assert "Client error '404 Not Found' for url 'www.airbnb.com#" in out

    def test_multiple_urls_and_plain_text(self) -> None:
        out = redact_urls_in_text(f"a {FEED_URL} b http://example.com/x?t={SECRET} c")
        assert SECRET not in out
        assert out.startswith("a www.airbnb.com#") and out.endswith(" c")

    def test_text_without_urls_unchanged(self) -> None:
        assert redact_urls_in_text("connect timed out") == "connect timed out"


def _status_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", FEED_URL)
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError(
        f"Client error '{status}' for url '{FEED_URL}'", request=request, response=response,
    )


FAILURES = [
    pytest.param(_status_error(404), "config", id="http-4xx"),
    pytest.param(_status_error(401), "auth", id="http-auth"),
    pytest.param(_status_error(503), "transient", id="http-5xx"),
    pytest.param(httpx.ConnectError(f"cannot connect to {FEED_URL}"), "transient", id="transport"),
    pytest.param(RuntimeError(f"parser blew up on {FEED_URL}"), "unknown", id="unknown"),
]


class TestPollOneNeverLogsFeedSecret:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(("exc", "category"), FAILURES)
    async def test_failed_fetch_leaks_nothing(
        self, db, seeded_channel_listing, caplog, exc, category,
    ) -> None:
        cl = seeded_channel_listing
        await channel_listing_repo.update(db, cl.id, cl.listing_id, {"ical_import_url": FEED_URL})
        await db.commit()
        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None

        with caplog.at_level(logging.DEBUG), _patched_uow(db):
            await channel_sync_service.poll_one(refreshed, client=_mock_client_raising(exc))

        assert caplog.records, "the failure must still be logged"
        for record in caplog.records:
            assert SECRET not in record.getMessage()
            assert record.exc_info is None  # Sentry would serialise the exception message
        assert SECRET not in caplog.text
        assert "12345" not in caplog.text

        after = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert after is not None
        assert after.last_import_error_category == category
        assert after.last_import_error is not None
        assert SECRET not in after.last_import_error
        assert "www.airbnb.com#" in after.last_import_error

    @pytest.mark.asyncio
    async def test_unsafe_url_error_does_not_leak(
        self, db, seeded_channel_listing, caplog,
    ) -> None:
        cl = seeded_channel_listing
        unsafe = f"http://169.254.169.254/latest/{SECRET}"
        await channel_listing_repo.update(db, cl.id, cl.listing_id, {"ical_import_url": unsafe})
        await db.commit()
        refreshed = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
        assert refreshed is not None

        with caplog.at_level(logging.DEBUG), _patched_uow(db):
            await channel_sync_service.poll_one(
                refreshed, client=_mock_client_raising(RuntimeError("must not egress")),
            )

        assert SECRET not in caplog.text
