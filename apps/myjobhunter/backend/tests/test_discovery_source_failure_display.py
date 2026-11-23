"""A saved search stored before fixed copy never shows its raw failure text.

Older rows can hold an adapter's text in ``last_error_message``. The stored
value is left alone (the next fetch overwrites it); the response shows the
generic line instead of anything that isn't fixed copy.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discovery_source_failure_display import displayable_failure_message
from app.core.discovery_source_failure_messages import (
    GREENHOUSE_BOARD_NOT_FOUND_MESSAGE,
    JSEARCH_MONTHLY_QUOTA_MESSAGE,
    JSEARCH_THROTTLED_MESSAGE_TEMPLATE,
    LEVER_COMPANY_NOT_FOUND_MESSAGE,
    SAVED_SEARCH_FETCH_FAILED_MESSAGE,
    SAVED_SEARCH_MISSING_QUERY_MESSAGE,
    SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE,
    SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE,
)
from app.models.discovery.discovery_source import DiscoverySource

_LEGACY_RAW_TEXT = (
    "network error: [Errno -2] Name or service not known "
    "(https://jsearch.p.rapidapi.com/search?query=x)"
)


@pytest.mark.parametrize(
    "message",
    [
        None,
        GREENHOUSE_BOARD_NOT_FOUND_MESSAGE,
        JSEARCH_MONTHLY_QUOTA_MESSAGE,
        JSEARCH_THROTTLED_MESSAGE_TEMPLATE.format(seconds=45),
        JSEARCH_THROTTLED_MESSAGE_TEMPLATE.format(seconds=3600),
        LEVER_COMPANY_NOT_FOUND_MESSAGE,
        SAVED_SEARCH_FETCH_FAILED_MESSAGE,
        SAVED_SEARCH_MISSING_QUERY_MESSAGE,
        SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE,
        SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE,
    ],
)
def test_fixed_copy_is_shown_as_stored(message: str | None) -> None:
    assert displayable_failure_message(message) == message


@pytest.mark.parametrize(
    "stored",
    [
        _LEGACY_RAW_TEXT,
        "Greenhouse board 'acme' not found (404) — check that the board token is correct and the board is public",
        "JSearch source missing required config.query (or config.roles)",
        JSEARCH_THROTTLED_MESSAGE_TEMPLATE.format(seconds="soon"),
        f"{JSEARCH_MONTHLY_QUOTA_MESSAGE} {_LEGACY_RAW_TEXT}",
        "",
    ],
)
def test_any_other_stored_text_is_shown_as_the_generic_line(stored: str) -> None:
    assert displayable_failure_message(stored) == SAVED_SEARCH_FETCH_FAILED_MESSAGE


@pytest.mark.asyncio
async def test_legacy_row_lists_with_the_generic_line_and_keeps_its_stored_text(
    db: AsyncSession, as_user, user_factory,
) -> None:
    user = await user_factory()
    src = DiscoverySource(
        user_id=uuid.UUID(user["id"]),
        source="jsearch",
        name="",
        config={"query": "x"},
        consecutive_failures=1,
        last_error_message=_LEGACY_RAW_TEXT,
    )
    db.add(src)
    await db.flush()

    async with await as_user(user) as client:
        listed = await client.get("/discover/sources")

    (row,) = [s for s in listed.json() if s["id"] == str(src.id)]
    assert row["last_error_message"] == SAVED_SEARCH_FETCH_FAILED_MESSAGE
    assert _LEGACY_RAW_TEXT not in listed.text
    await db.refresh(src)
    assert src.last_error_message == _LEGACY_RAW_TEXT
