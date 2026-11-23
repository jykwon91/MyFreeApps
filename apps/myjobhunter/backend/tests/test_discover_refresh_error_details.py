"""POST /discover/sources/{id}/refresh never echoes an adapter's error text.

JSearch's transient and invalid-response errors carry httpx and response-body
text. The reply keeps its status and sends fixed copy; the text is logged.
"""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.discovery_refresh_messages import (
    DISCOVERY_FETCH_FAILED_DETAIL,
    DISCOVERY_UPSTREAM_UNAVAILABLE_DETAIL,
)
from app.services.discovery.sources.jsearch import (
    JSearchInvalidResponseError,
    JSearchTransientError,
)

_SEARCH_PATH = "app.services.discovery.discovery_fetch_service.jsearch.search"
_SECRET_TEXT = "connect to internal-proxy.svc.cluster.local:8443 failed"


async def _refresh_with(as_user, user, error: Exception):
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        with patch(_SEARCH_PATH, new_callable=AsyncMock, side_effect=error):
            return await a.post(f"/discover/sources/{source_id}/refresh")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "expected_detail"),
    [
        (JSearchTransientError(f"network error: {_SECRET_TEXT}"), DISCOVERY_UPSTREAM_UNAVAILABLE_DETAIL),
        (JSearchInvalidResponseError(f"JSearch returned non-JSON body: {_SECRET_TEXT}"), DISCOVERY_FETCH_FAILED_DETAIL),
    ],
)
async def test_refresh_502_sends_fixed_detail_and_logs_the_error(
    client: AsyncClient,
    user_factory,
    as_user,
    caplog: pytest.LogCaptureFixture,
    error: Exception,
    expected_detail: str,
) -> None:
    user = await user_factory()

    with caplog.at_level(logging.WARNING, logger="app.api.discover"):
        resp = await _refresh_with(as_user, user, error)

    assert resp.status_code == 502
    assert resp.json()["detail"] == expected_detail
    assert _SECRET_TEXT not in resp.text
    logged = [r for r in caplog.records if r.name == "app.api.discover"]
    assert any(r.exc_info and _SECRET_TEXT in str(r.exc_info[1]) for r in logged)
