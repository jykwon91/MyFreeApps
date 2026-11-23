"""A failed fetch stores fixed copy as the saved search's reason, never the adapter's text.

Adapter errors carry httpx and provider text (URLs, hostnames, response
bodies). The saved-search row and the fetch audit row get a fixed message
chosen by the error's class; the text goes to the log. JSearch's quota
messages are written for the user and are kept, so the row matches the
refresh route's 429 reply.
"""
from __future__ import annotations

import logging
import uuid
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.services.discovery import discovery_fetch_service
from app.services.discovery.discovery_fetch_errors import DiscoverySourceMissingQueryError
from app.services.discovery.sources.greenhouse import (
    GreenhouseError,
    GreenhouseInvalidBoardError,
    GreenhouseTransientError,
)
from app.services.discovery.sources.jsearch import (
    JSearchAuthError,
    JSearchError,
    JSearchInvalidResponseError,
    JSearchQuotaError,
    JSearchTransientError,
)
from app.services.discovery.sources.lever import (
    LeverError,
    LeverInvalidSlugError,
    LeverTransientError,
)

_SECRET_TEXT = "connect to internal-proxy.svc.cluster.local:8443 failed"
_SEARCH_PATH = "app.services.discovery.discovery_fetch_service.jsearch.search"


async def _make_source(
    db: AsyncSession, user: dict, source: str, config: dict | None = None,
) -> DiscoverySource:
    src = DiscoverySource(
        user_id=uuid.UUID(user["id"]), source=source, name="", config=config or {},
    )
    db.add(src)
    await db.flush()
    return src


def _stub_adapter(monkeypatch: pytest.MonkeyPatch, source: str, error: Exception) -> None:
    adapter = AsyncMock(side_effect=error)
    if source == "greenhouse":
        monkeypatch.setattr(discovery_fetch_service, "_GREENHOUSE_ADAPTER", adapter)
    else:
        monkeypatch.setitem(discovery_fetch_service._ADAPTERS, source, adapter)


async def _stored_reasons(db: AsyncSession, src: DiscoverySource) -> tuple[str | None, str | None]:
    await db.refresh(src)
    fetch = (
        await db.execute(
            select(DiscoveryFetch).where(DiscoveryFetch.discovery_source_id == src.id),
        )
    ).scalar_one()
    return src.last_error_message, fetch.error_message


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source", "error", "expected"),
    [
        ("jsearch", JSearchAuthError(f"JSearch returned 401 via {_SECRET_TEXT}"), SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE),
        ("jsearch", JSearchTransientError(f"network error: {_SECRET_TEXT}"), SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE),
        ("jsearch", JSearchInvalidResponseError(f"non-JSON body: {_SECRET_TEXT}"), SAVED_SEARCH_FETCH_FAILED_MESSAGE),
        ("jsearch", JSearchError(f"unexpected status 418: {_SECRET_TEXT}"), SAVED_SEARCH_FETCH_FAILED_MESSAGE),
        ("jsearch", httpx.ConnectError(_SECRET_TEXT), SAVED_SEARCH_FETCH_FAILED_MESSAGE),
        ("greenhouse", GreenhouseTransientError(f"Greenhouse network error: {_SECRET_TEXT}"), SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE),
        ("greenhouse", GreenhouseInvalidBoardError(f"board not found (404) {_SECRET_TEXT}"), GREENHOUSE_BOARD_NOT_FOUND_MESSAGE),
        ("greenhouse", GreenhouseError(f"non-JSON body: {_SECRET_TEXT}"), SAVED_SEARCH_FETCH_FAILED_MESSAGE),
        ("greenhouse", ValueError(f"Greenhouse source config is missing {_SECRET_TEXT}"), SAVED_SEARCH_FETCH_FAILED_MESSAGE),
        ("lever", LeverTransientError(f"Lever network error: {_SECRET_TEXT}"), SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE),
        ("lever", LeverInvalidSlugError(f"company not found (404) {_SECRET_TEXT}"), LEVER_COMPANY_NOT_FOUND_MESSAGE),
        ("lever", LeverError(f"response is not a list: {_SECRET_TEXT}"), SAVED_SEARCH_FETCH_FAILED_MESSAGE),
    ],
)
async def test_failed_fetch_stores_the_fixed_message_for_its_error_class(
    db: AsyncSession,
    user_factory,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    source: str,
    error: Exception,
    expected: str,
) -> None:
    user = await user_factory()
    src = await _make_source(db, user, source)
    _stub_adapter(monkeypatch, source, error)

    with caplog.at_level(logging.WARNING, logger=discovery_fetch_service.__name__):
        with pytest.raises(type(error)) as raised:
            await discovery_fetch_service.fetch_source(src.user_id, src.id)

    assert raised.value is error
    source_reason, fetch_reason = await _stored_reasons(db, src)
    assert source_reason == expected
    assert fetch_reason == expected
    assert _SECRET_TEXT not in source_reason
    logged = [r for r in caplog.records if r.name == discovery_fetch_service.__name__]
    assert any(r.exc_info and r.exc_info[1] is error for r in logged)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "message",
    [
        JSEARCH_MONTHLY_QUOTA_MESSAGE,
        JSEARCH_THROTTLED_MESSAGE_TEMPLATE.format(seconds=3600),
    ],
)
async def test_quota_failure_keeps_its_message_written_for_the_user(
    db: AsyncSession, user_factory, monkeypatch: pytest.MonkeyPatch, message: str,
) -> None:
    user = await user_factory()
    src = await _make_source(db, user, "jsearch")
    _stub_adapter(monkeypatch, "jsearch", JSearchQuotaError(message))

    with pytest.raises(JSearchQuotaError):
        await discovery_fetch_service.fetch_source(src.user_id, src.id)

    assert await _stored_reasons(db, src) == (message, message)


@pytest.mark.asyncio
async def test_jsearch_search_without_query_or_roles_says_what_to_fix(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    src = await _make_source(db, user, "jsearch", config={})

    with pytest.raises(DiscoverySourceMissingQueryError):
        await discovery_fetch_service.fetch_source(src.user_id, src.id)

    assert await _stored_reasons(db, src) == (
        SAVED_SEARCH_MISSING_QUERY_MESSAGE,
        SAVED_SEARCH_MISSING_QUERY_MESSAGE,
    )


@pytest.mark.asyncio
async def test_quota_row_and_429_reply_say_the_same_thing(as_user, user_factory) -> None:
    user = await user_factory()
    async with await as_user(user) as client:
        created = await client.post(
            "/discover/sources", json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        quota = JSearchQuotaError(JSEARCH_MONTHLY_QUOTA_MESSAGE)
        with patch(_SEARCH_PATH, new_callable=AsyncMock, side_effect=quota):
            refreshed = await client.post(f"/discover/sources/{source_id}/refresh")
        listed = await client.get("/discover/sources")

    assert refreshed.status_code == 429
    assert refreshed.json()["detail"] == JSEARCH_MONTHLY_QUOTA_MESSAGE
    (row,) = [s for s in listed.json() if s["id"] == source_id]
    assert row["last_error_message"] == JSEARCH_MONTHLY_QUOTA_MESSAGE


@pytest.mark.asyncio
async def test_transient_failure_row_never_shows_the_network_text(as_user, user_factory) -> None:
    user = await user_factory()
    async with await as_user(user) as client:
        created = await client.post(
            "/discover/sources", json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        transient = JSearchTransientError(f"network error: {_SECRET_TEXT}")
        with patch(_SEARCH_PATH, new_callable=AsyncMock, side_effect=transient):
            await client.post(f"/discover/sources/{source_id}/refresh")
        listed = await client.get("/discover/sources")

    (row,) = [s for s in listed.json() if s["id"] == source_id]
    assert row["last_error_message"] == SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE
    assert _SECRET_TEXT not in listed.text
