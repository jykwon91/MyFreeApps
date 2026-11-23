"""A channel row's import error is fixed copy, never the error's own text.

Fetch errors name the feed's host and the SSRF guard's reason names the
private IP a host resolved to, so the poller stores copy chosen by the
error's class. Rows stored before that still hold raw text: the response
shows only known fixed copy, and the generic line for anything else.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import get_args
from unittest.mock import patch

import pytest
from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.capped_fetch_failure_reason import CappedFetchFailureReason
from platform_shared.core.url_safety import UnsafeURLError
from platform_shared.core.url_safety_messages import UNSAFE_URL_DETAIL

from app.core.channel_import_error_display import displayable_import_error
from app.core.channel_import_messages import (
    CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE,
    CHANNEL_IMPORT_LINK_REJECTED_MESSAGE,
    CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON,
    CHANNEL_IMPORT_NETWORK_MESSAGE,
    CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE,
    CHANNEL_IMPORT_SERVER_ERROR_MESSAGE,
    CHANNEL_IMPORT_TIMEOUT_MESSAGE,
    CHANNEL_IMPORT_TOO_LARGE_MESSAGE,
    CHANNEL_IMPORT_TOO_MANY_REDIRECTS_MESSAGE,
    CHANNEL_IMPORT_UNREADABLE_MESSAGE,
)
from app.repositories import channel_listing_repo
from app.services.listings import channel_listing_service
from app.services.listings.channel_import_failure_message import import_failure_message
from tests.test_channel_sync_service import seeded_channel_listing  # noqa: F401 — fixture re-export

# Badge copy is cut at 80 characters (ChannelImportStatusBadge.tsx).
_BADGE_LIMIT = 80

_ALL_MESSAGES = [
    UNSAFE_URL_DETAIL,
    CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE,
    CHANNEL_IMPORT_LINK_REJECTED_MESSAGE,
    CHANNEL_IMPORT_NETWORK_MESSAGE,
    CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE,
    CHANNEL_IMPORT_SERVER_ERROR_MESSAGE,
    CHANNEL_IMPORT_TIMEOUT_MESSAGE,
    CHANNEL_IMPORT_TOO_LARGE_MESSAGE,
    CHANNEL_IMPORT_TOO_MANY_REDIRECTS_MESSAGE,
    CHANNEL_IMPORT_UNREADABLE_MESSAGE,
]

# Shapes the poller stored before this fix.
_LEGACY_ROWS = [
    "UnsafeURLError: host 'calendar.internal' resolves to non-public address 10.0.0.12",
    "CappedFetchError (www.airbnb.com#1a2b3c4d): fetch from www.airbnb.com failed: HTTP 404",
    "ValueError: Expected instance of <class 'icalendar.cal.Calendar'>",
]


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (UnsafeURLError("host 'calendar.internal' resolves to non-public address 10.0.0.12"), UNSAFE_URL_DETAIL),
        (CappedFetchError("timeout", host="h.example"), CHANNEL_IMPORT_TIMEOUT_MESSAGE),
        (CappedFetchError("network", host="h.example"), CHANNEL_IMPORT_NETWORK_MESSAGE),
        (CappedFetchError("too_large", host="h.example"), CHANNEL_IMPORT_TOO_LARGE_MESSAGE),
        (CappedFetchError("too_many_redirects", host="h.example"), CHANNEL_IMPORT_TOO_MANY_REDIRECTS_MESSAGE),
        (CappedFetchError("bad_encoding", host="h.example"), CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE),
        (CappedFetchError("unexpected_content_type", host="h.example"), CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE),
        (CappedFetchError("http_status", host="h.example", status_code=401), CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE),
        (CappedFetchError("http_status", host="h.example", status_code=403), CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE),
        (CappedFetchError("http_status", host="h.example", status_code=404), CHANNEL_IMPORT_LINK_REJECTED_MESSAGE),
        (CappedFetchError("http_status", host="h.example", status_code=503), CHANNEL_IMPORT_SERVER_ERROR_MESSAGE),
        (RuntimeError("parser blew up near h.example"), CHANNEL_IMPORT_UNREADABLE_MESSAGE),
    ],
)
def test_failure_message_is_chosen_by_class(exc: BaseException, expected: str) -> None:
    message = import_failure_message(exc)

    assert message == expected
    assert "h.example" not in message
    assert "10.0.0.12" not in message


def test_every_fetch_reason_but_http_status_has_a_message() -> None:
    reasons = set(get_args(CappedFetchFailureReason))
    assert set(CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON) == reasons - {"http_status"}


@pytest.mark.parametrize("message", _ALL_MESSAGES)
def test_messages_fit_the_badge_and_pass_display(message: str) -> None:
    assert 0 < len(message) <= _BADGE_LIMIT
    assert displayable_import_error(message) == message


@pytest.mark.parametrize("stored", [None, ""])
def test_no_error_stays_no_error(stored: str | None) -> None:
    assert displayable_import_error(stored) == stored


@pytest.mark.parametrize("stored", _LEGACY_ROWS)
def test_legacy_raw_text_shows_the_generic_line(stored: str) -> None:
    assert displayable_import_error(stored) == CHANNEL_IMPORT_UNREADABLE_MESSAGE


@pytest.mark.asyncio
async def test_listing_channels_hides_a_legacy_row_but_keeps_it_stored(
    db, seeded_channel_listing, test_org, test_user,  # noqa: F811 — fixture
) -> None:
    cl = seeded_channel_listing
    legacy = _LEGACY_ROWS[0]
    await channel_listing_repo.mark_imported(
        db, cl.id, last_imported_at=datetime.now(timezone.utc), last_import_error=legacy, last_import_error_category="config",
    )
    await db.commit()

    @asynccontextmanager
    async def _fake():
        yield db

    with patch("app.services.listings.channel_listing_service.unit_of_work", _fake):
        rows = await channel_listing_service.list_channels(test_org.id, test_user.id, cl.listing_id)

    shown = next(r for r in rows if r.id == str(cl.id))
    assert shown.last_import_error == CHANNEL_IMPORT_UNREADABLE_MESSAGE
    assert "10.0.0.12" not in shown.model_dump_json()
    stored = await channel_listing_repo.get_by_channel_listing_id(db, cl.id)
    assert stored is not None and stored.last_import_error == legacy
