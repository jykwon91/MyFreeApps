"""WoW Forever server status — route and service unit tests.

Tests:
  - GET /api/wow/server-status happy path (all online)
  - Rulesets are ordered (Normal, PvP, Roleplay, Roleplay PvP); unknown extras appended
  - Region validation (400 on unknown region)
  - Upstream error maps to 502 (never "servers offline")
  - Per-region cache: a second call within TTL reuses the first result
  - Hash rediscovery: when Blizzard returns PersistedQueryNotFound, the client
    re-fetches the status page, extracts the new documentId from the bundle,
    and retries
  - documentId extraction regex against a minimal JS fixture
"""
from __future__ import annotations

import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import AsyncClient

import app.services.wow.server_status_client as _svc

URL = "/api/wow/server-status"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REALMS_ALL_ONLINE: list[dict[str, Any]] = [
    {"name": "Normal", "slug": "normal", "isRuleset": True, "online": True},
    {"name": "PvP", "slug": "pvp", "isRuleset": True, "online": True},
    {"name": "Roleplay", "slug": "roleplay", "isRuleset": True, "online": True},
    {"name": "Roleplay PvP", "slug": "roleplay-pvp", "isRuleset": True, "online": True},
]

REALMS_ONE_DOWN: list[dict[str, Any]] = [
    {"name": "Normal", "slug": "normal", "isRuleset": True, "online": True},
    {"name": "PvP", "slug": "pvp", "isRuleset": True, "online": False},
    {"name": "Roleplay", "slug": "roleplay", "isRuleset": True, "online": True},
    {"name": "Roleplay PvP", "slug": "roleplay-pvp", "isRuleset": True, "online": True},
]

GRAPHQL_RESPONSE_OK = {"data": {"Realms": REALMS_ALL_ONLINE}}
GRAPHQL_RESPONSE_ONE_DOWN = {"data": {"Realms": REALMS_ONE_DOWN}}
GRAPHQL_RESPONSE_HASH_EXPIRED = {
    "errors": [{"message": "PersistedQueryNotFound", "extensions": {"code": "PERSISTED_QUERY_NOT_FOUND"}}]
}
GRAPHQL_RESPONSE_OTHER_ERROR = {
    "errors": [{"message": "InternalServerError"}]
}

# A minimal JS snippet that the documentId regex should match.
NEW_DOCUMENT_ID = "aabbccdd" + "00112233" * 7  # 64 hex chars
FAKE_BUNDLE_JS = (
    f'n.operationName="GetRealmStatusData"),t.documentId="{NEW_DOCUMENT_ID}"'
    + "someOtherStuff"
)
FAKE_STATUS_HTML = (
    '<script src="https://assets-bwa.worldofwarcraft.blizzard.com/static/realm-status.abc123.js">'
    "</script>"
)


def _mock_httpx_response(json_data: Any, status_code: int = 200) -> MagicMock:
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = json_data
    mock_resp.text = str(json_data)
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


@pytest.fixture(autouse=True)
def _reset_server_status_cache():
    """Clear the in-process cache and reset discovered hash between tests."""
    _svc._region_cache.clear()
    _svc._discovered_document_id = None
    yield
    _svc._region_cache.clear()
    _svc._discovered_document_id = None


# ---------------------------------------------------------------------------
# Route tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_all_online(client: AsyncClient) -> None:
    """All rulesets online → 200 with correct payload."""
    with patch(
        "app.services.wow.server_status_client._post_graphql",
        new_callable=AsyncMock,
        return_value=GRAPHQL_RESPONSE_OK,
    ):
        resp = await client.get(URL, params={"region": "us"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["region"] == "us"
    assert "checked_at" in data
    rulesets = data["rulesets"]
    assert len(rulesets) == 4
    assert rulesets[0]["slug"] == "normal"
    assert rulesets[0]["online"] is True
    assert rulesets[1]["slug"] == "pvp"
    assert rulesets[2]["slug"] == "roleplay"
    assert rulesets[3]["slug"] == "roleplay-pvp"


@pytest.mark.asyncio
async def test_one_ruleset_down(client: AsyncClient) -> None:
    """Partial outage is reflected in the response without mapping to an error."""
    with patch(
        "app.services.wow.server_status_client._post_graphql",
        new_callable=AsyncMock,
        return_value=GRAPHQL_RESPONSE_ONE_DOWN,
    ):
        resp = await client.get(URL, params={"region": "eu"})

    assert resp.status_code == 200
    rulesets = resp.json()["rulesets"]
    pvp = next(r for r in rulesets if r["slug"] == "pvp")
    assert pvp["online"] is False


@pytest.mark.asyncio
async def test_unknown_region_returns_400(client: AsyncClient) -> None:
    resp = await client.get(URL, params={"region": "xx"})
    assert resp.status_code == 400
    assert "xx" in resp.json()["detail"].lower() or "unknown" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_upstream_error_returns_502(client: AsyncClient) -> None:
    """Blizzard returning errors (not hash-related) → 502 from our API."""
    with patch(
        "app.services.wow.server_status_client._post_graphql",
        new_callable=AsyncMock,
        return_value=GRAPHQL_RESPONSE_OTHER_ERROR,
    ):
        resp = await client.get(URL, params={"region": "us"})

    assert resp.status_code == 502
    assert "Blizzard" in resp.json()["detail"] or "Could not" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_network_error_returns_502(client: AsyncClient) -> None:
    """httpx connection failure → 502."""
    with patch(
        "app.services.wow.server_status_client._post_graphql",
        new_callable=AsyncMock,
        side_effect=_svc.ServerStatusUpstreamError("connection refused"),
    ):
        resp = await client.get(URL, params={"region": "kr"})

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_cache_serves_second_request_without_upstream_call(client: AsyncClient) -> None:
    """Within TTL the cache is used; Blizzard is only called once."""
    call_count = 0

    async def _counted(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return GRAPHQL_RESPONSE_OK

    with patch(
        "app.services.wow.server_status_client._post_graphql",
        new_callable=AsyncMock,
        side_effect=_counted,
    ):
        resp1 = await client.get(URL, params={"region": "us"})
        resp2 = await client.get(URL, params={"region": "us"})

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert call_count == 1


# ---------------------------------------------------------------------------
# Hash rediscovery test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hash_rediscovery_retries_with_new_id(client: AsyncClient) -> None:
    """When Blizzard returns PersistedQueryNotFound, the client rediscovers the
    hash from the bundle and retries — the second call succeeds."""
    post_calls: list[dict] = []

    async def _mock_post(http_client, payload):
        post_calls.append(payload)
        # First call: hash expired. Second call: success.
        if len(post_calls) == 1:
            return GRAPHQL_RESPONSE_HASH_EXPIRED
        return GRAPHQL_RESPONSE_OK

    async def _mock_discover(http_client, region):
        return NEW_DOCUMENT_ID

    with (
        patch(
            "app.services.wow.server_status_client._post_graphql",
            side_effect=_mock_post,
        ),
        patch(
            "app.services.wow.server_status_client._discover_document_id",
            new_callable=AsyncMock,
            side_effect=_mock_discover,
        ),
    ):
        resp = await client.get(URL, params={"region": "us"})

    assert resp.status_code == 200
    assert len(post_calls) == 2
    # Second payload should use the newly discovered id.
    second_hash = post_calls[1]["extensions"]["persistedQuery"]["sha256Hash"]
    assert second_hash == NEW_DOCUMENT_ID
    # The module-level cache is updated.
    assert _svc._discovered_document_id == NEW_DOCUMENT_ID


# ---------------------------------------------------------------------------
# documentId extraction — unit test against a JS fixture
# ---------------------------------------------------------------------------


def test_document_id_regex_extracts_from_bundle() -> None:
    """The regex in _DOCUMENT_ID_RE matches the expected JS pattern."""
    match = _svc._DOCUMENT_ID_RE.search(FAKE_BUNDLE_JS)
    assert match is not None
    assert match.group(1) == NEW_DOCUMENT_ID


def test_document_id_regex_no_match_on_unrelated_js() -> None:
    unrelated = 'var x = "GetRealmStatusData"; function foo() { return 42; }'
    assert _svc._DOCUMENT_ID_RE.search(unrelated) is None


# ---------------------------------------------------------------------------
# _parse_response ordering
# ---------------------------------------------------------------------------


def test_parse_response_stable_order_with_unknown_extra() -> None:
    """Unknown rulesets are appended after the known order."""
    from datetime import datetime, timezone

    realms_with_extra = REALMS_ALL_ONLINE + [
        {"name": "Some New Ruleset", "slug": "new-extra", "isRuleset": True, "online": True}
    ]
    data = {"data": {"Realms": realms_with_extra}}
    result = _svc._parse_response("us", data)
    slugs = [r.slug for r in result.rulesets]
    assert slugs[:4] == ["normal", "pvp", "roleplay", "roleplay-pvp"]
    assert slugs[4] == "new-extra"


def test_parse_response_empty_realms() -> None:
    """An empty Realms array is valid (a new region before servers are up)."""
    result = _svc._parse_response("us", {"data": {"Realms": []}})
    assert result.rulesets == []
