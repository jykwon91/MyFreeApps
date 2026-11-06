"""WoW Forever server status — calls Blizzard's GraphQL endpoint.

Blizzard's realm-status page loads rulesets (Normal, PvP, Roleplay, Roleplay PvP)
from a persisted-query GraphQL endpoint.  The ``documentId`` (sha256 hash of the
query document) is baked into their JS bundle and can change on any redeploy.

Strategy:
  1. Try the cached/default hash first.
  2. If Blizzard replies with a "PersistedQueryNotFound"-style error, rediscover
     the hash once: fetch the status HTML page, find the ``realm-status.*.js``
     bundle, regex the documentId out of it, then retry.
  3. Cache per region for CACHE_TTL_SECONDS so visitors never hammer Blizzard.
  4. Log every Blizzard error code at WARNING — never collapse to a bare bool.

Upstream failure (network error, timeout, Blizzard errors) raises
``ServerStatusUpstreamError``, which the route turns into a 502 so callers can
distinguish "servers offline" from "we couldn't reach Blizzard".
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Final

import httpx

from app.schemas.wow.server_status import ServerRuleset, ServerStatusResponse

logger = logging.getLogger(__name__)

# --- constants ----------------------------------------------------------------

BLIZZARD_GRAPHQL_URL: Final = "https://worldofwarcraft.blizzard.com/en-us/graphql"
BLIZZARD_STATUS_PAGE_URL: Final = "https://worldofwarcraft.blizzard.com/en-us/game/status/{region}"
BLIZZARD_BUNDLE_HOST: Final = "https://assets-bwa.worldofwarcraft.blizzard.com"

# Default documentId from the GetRealmStatusData query in Blizzard's bundle.
# This WILL change on redeploys. It is used as the first attempt; if Blizzard
# rejects it with a "not found" error, the rediscovery flow updates it.
DEFAULT_DOCUMENT_ID: Final = (
    "e890f42a5375f136b9f9165408fb2bc372cc5f88be0b21e7dc681a70d9999c67"
)

OPERATION_NAME: Final = "GetRealmStatusData"

# Rulesets in stable display order. Unknown extras are appended after.
RULESET_ORDER: Final = ["normal", "pvp", "roleplay", "roleplay-pvp"]

CACHE_TTL_SECONDS: Final = 60
REQUEST_TIMEOUT_SECONDS: Final = 8.0

ALLOWED_REGIONS: Final = frozenset({"us", "eu", "kr", "tw"})

# "PersistedQueryNotFound" or "PersistedQueryNotSupported" both mean the hash
# is stale and we should rediscover.
_HASH_EXPIRED_PATTERNS: Final = (
    "PersistedQueryNotFound",
    "PersistedQueryNotSupported",
)

# Regex to extract the documentId from Blizzard's JS bundle.
# Pattern: GetRealmStatusData"),t.documentId="<64 hex chars>"
_DOCUMENT_ID_RE: Final = re.compile(
    r'GetRealmStatusData"\s*\)\s*,\s*\w+\.documentId\s*=\s*"([0-9a-f]{64})"'
)

# Regex to find the realm-status JS bundle URL in the HTML.
# Matches hrefs like /en-us/static/realm-status.<hash>.js or asset URLs.
_BUNDLE_URL_RE: Final = re.compile(
    r'src=["\']([^"\']*realm-status\.[^"\']+\.js)["\']'
)


# --- in-process cache ---------------------------------------------------------

# Keyed by region slug. Stores (ServerStatusResponse, fetch_time_monotonic).
_region_cache: dict[str, tuple[ServerStatusResponse, float]] = {}

# Cached documentId discovered from the bundle. Shared across regions since
# the bundle is the same regardless of region.
_discovered_document_id: str | None = None


class ServerStatusUpstreamError(Exception):
    """Blizzard's API returned an error or the request failed entirely."""


# --- public API ---------------------------------------------------------------

async def get_region_status(region: str) -> ServerStatusResponse:
    """Return the server status for *region*, using the per-region cache.

    Args:
        region: One of "us", "eu", "kr", "tw" (caller validates this).

    Returns:
        A ``ServerStatusResponse`` with the rulesets in stable display order.

    Raises:
        ServerStatusUpstreamError: Blizzard's API returned errors or the
            request failed (network, timeout, etc.).  The route maps this to
            502 so callers know the failure is upstream, not "servers offline".
    """
    now = time.monotonic()
    cached, fetched_at = _region_cache.get(region, (None, 0.0))
    if cached is not None and (now - fetched_at) < CACHE_TTL_SECONDS:
        return cached

    result = await _fetch_region_status(region)
    _region_cache[region] = (result, time.monotonic())
    return result


# --- internal -----------------------------------------------------------------

async def _fetch_region_status(region: str) -> ServerStatusResponse:
    global _discovered_document_id

    document_id = _discovered_document_id or DEFAULT_DOCUMENT_ID
    slug = f"forever-{region}"

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        payload = _build_payload(slug, document_id)
        data = await _post_graphql(client, payload)

        # If Blizzard signals that our hash is stale, rediscover once.
        if _is_hash_expired(data):
            logger.warning(
                "server_status: Blizzard returned hash-not-found for documentId=%s — "
                "attempting rediscovery for region=%s",
                document_id,
                region,
            )
            new_id = await _discover_document_id(client, region)
            _discovered_document_id = new_id
            payload = _build_payload(slug, new_id)
            data = await _post_graphql(client, payload)

    if "errors" in data:
        codes = [e.get("message", "") for e in data["errors"]]
        logger.warning(
            "server_status: Blizzard errors for region=%s codes=%s",
            region,
            codes,
        )
        raise ServerStatusUpstreamError(
            f"Blizzard returned errors for region={region}: {codes}"
        )

    return _parse_response(region, data)


def _build_payload(slug: str, document_id: str) -> dict:
    return {
        "operationName": OPERATION_NAME,
        "variables": {"input": {"compoundRegionGameVersionSlug": slug}},
        "extensions": {
            "persistedQuery": {"version": 1, "sha256Hash": document_id}
        },
    }


async def _post_graphql(client: httpx.AsyncClient, payload: dict) -> dict:
    try:
        response = await client.post(
            BLIZZARD_GRAPHQL_URL,
            json=payload,
            headers={"content-type": "application/json"},
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException as exc:
        raise ServerStatusUpstreamError(
            f"Timeout reaching Blizzard's status API: {exc}"
        ) from exc
    except httpx.HTTPError as exc:
        raise ServerStatusUpstreamError(
            f"HTTP error from Blizzard's status API: {exc}"
        ) from exc
    except Exception as exc:
        raise ServerStatusUpstreamError(
            f"Unexpected error reaching Blizzard's status API: {exc}"
        ) from exc


def _is_hash_expired(data: dict) -> bool:
    """True when Blizzard's response signals the persisted query hash is stale."""
    errors = data.get("errors", [])
    return any(
        any(pattern in e.get("message", "") for pattern in _HASH_EXPIRED_PATTERNS)
        for e in errors
    )


async def _discover_document_id(client: httpx.AsyncClient, region: str) -> str:
    """Scrape Blizzard's status page HTML to find the current documentId.

    1. Fetch the HTML page for the region.
    2. Find the ``realm-status.*.js`` script URL.
    3. Fetch that script.
    4. Extract the documentId with a regex.

    Raises:
        ServerStatusUpstreamError: If any step fails.
    """
    page_url = BLIZZARD_STATUS_PAGE_URL.format(region=region)
    try:
        page_response = await client.get(page_url, follow_redirects=True)
        page_response.raise_for_status()
        html = page_response.text
    except httpx.HTTPError as exc:
        raise ServerStatusUpstreamError(
            f"Could not fetch status page for hash rediscovery: {exc}"
        ) from exc

    bundle_match = _BUNDLE_URL_RE.search(html)
    if not bundle_match:
        raise ServerStatusUpstreamError(
            "Could not find realm-status JS bundle URL in the status page HTML"
        )

    bundle_path = bundle_match.group(1)
    # The bundle URL may be absolute or relative.
    if bundle_path.startswith("http"):
        bundle_url = bundle_path
    elif bundle_path.startswith("//"):
        bundle_url = f"https:{bundle_path}"
    else:
        bundle_url = f"{BLIZZARD_BUNDLE_HOST}{bundle_path}"

    try:
        bundle_response = await client.get(bundle_url)
        bundle_response.raise_for_status()
        js_text = bundle_response.text
    except httpx.HTTPError as exc:
        raise ServerStatusUpstreamError(
            f"Could not fetch realm-status bundle for hash rediscovery: {exc}"
        ) from exc

    id_match = _DOCUMENT_ID_RE.search(js_text)
    if not id_match:
        raise ServerStatusUpstreamError(
            "Could not find GetRealmStatusData documentId in the realm-status bundle"
        )

    new_id = id_match.group(1)
    logger.info(
        "server_status: rediscovered documentId=%s from bundle=%s",
        new_id,
        bundle_url,
    )
    return new_id


def _parse_response(region: str, data: dict) -> ServerStatusResponse:
    realms_raw: list[dict] = (data.get("data") or {}).get("Realms") or []

    # Build a lookup by slug for ordering, then append unknowns.
    by_slug = {r.get("slug", ""): r for r in realms_raw}
    ordered: list[ServerRuleset] = []
    seen: set[str] = set()

    for slug in RULESET_ORDER:
        if slug in by_slug:
            r = by_slug[slug]
            ordered.append(
                ServerRuleset(
                    name=r.get("name", slug),
                    slug=slug,
                    online=bool(r.get("online", False)),
                )
            )
            seen.add(slug)

    # Append any rulesets not in the known order (future expansions).
    for r in realms_raw:
        slug = r.get("slug", "")
        if slug not in seen:
            ordered.append(
                ServerRuleset(
                    name=r.get("name", slug),
                    slug=slug,
                    online=bool(r.get("online", False)),
                )
            )

    return ServerStatusResponse(
        region=region,
        checked_at=datetime.now(timezone.utc),
        rulesets=ordered,
    )
