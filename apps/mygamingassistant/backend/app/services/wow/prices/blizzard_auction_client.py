"""Blizzard's Game Data API for WoW Forever auction houses.

* ``POST https://oauth.battle.net/token`` (client credentials, HTTP Basic) →
  a bearer token, good for 24 hours; one is taken per refresh.
* ``GET /data/wow/ruleset/{id}/auctions/`` → the auction-house index; each
  house's name says its faction.
* ``GET /data/wow/ruleset/{id}/auctions/{house}/commodities`` → stackables:
  ``{id, item: {id}, quantity, unit_price, time_left}``.
* ``GET /data/wow/ruleset/{id}/auctions/{house}`` → everything else:
  ``{id, item: {id}, buyout, quantity, time_left}`` (buyout = whole listing).

Every failure becomes a ``PriceFetchError`` carrying the HTTP status and
Blizzard's own code (the API's ``type``, or the OAuth ``error``), so the
refresh can log why. The credentials are never logged or put in an error.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from email.utils import parsedate_to_datetime
from types import TracebackType
from typing import Any

import httpx

from app.core.wow_prices import (
    BLIZZARD_API_BASE,
    BLIZZARD_LOCALE,
    BLIZZARD_MAX_BYTES,
    BLIZZARD_NAMESPACE,
    BLIZZARD_RULESET_ID,
    BLIZZARD_TIMEOUT_SECONDS,
    BLIZZARD_TOKEN_URL,
    HOUSE_NAME_FACTIONS,
)
from app.services.wow.prices.auction_house import AuctionHouse
from app.services.wow.prices.house_auctions import HouseAuctions
from app.services.wow.prices.price_fetch_error import PriceFetchError

logger = logging.getLogger(__name__)

USER_AGENT = "MyGamingAssistant/1.0 (+https://mygamingassistant.myfreeapps.org/wow-forever)"
_REASON_MAX = 200


def _error_from(response: httpx.Response) -> PriceFetchError:
    """Blizzard's error body → a PriceFetchError with its code, whatever shape it came in."""
    code: str | None = None
    reason = response.reason_phrase or "request failed"
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        # Game Data API: {"code": 404, "type": "BLZWEBAPI00000404", "detail": "Not Found"}
        # OAuth: {"error": "invalid_client", "error_description": "..."}
        raw_code = body.get("type") or body.get("error")
        code = str(raw_code) if raw_code else None
        detail = body.get("detail") or body.get("error_description")
        if detail:
            reason = str(detail)
    elif response.text:
        reason = response.text
    return PriceFetchError(reason[:_REASON_MAX], status_code=response.status_code, code=code)


def _snapshot_time(response: httpx.Response) -> datetime | None:
    raw = response.headers.get("Last-Modified")
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        logger.warning("blizzard auctions: unreadable Last-Modified %r", raw)
        return None


class BlizzardAuctionClient:
    """``async with BlizzardAuctionClient(id, secret) as client:`` — one token per block."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not client_id or not client_secret:
            raise PriceFetchError("BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are not set")
        self._credentials = (client_id, client_secret)
        # Tests pass an httpx.MockTransport; production uses the default.
        self._transport = transport
        self._http: httpx.AsyncClient | None = None
        self._token: str | None = None

    async def __aenter__(self) -> BlizzardAuctionClient:
        self._http = httpx.AsyncClient(
            transport=self._transport,
            timeout=BLIZZARD_TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT},
        )
        try:
            self._token = await self._fetch_token()
        except BaseException:
            await self._http.aclose()
            raise
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def _send(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        if self._http is None:
            raise RuntimeError("BlizzardAuctionClient used outside `async with`")
        try:
            response = await self._http.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise PriceFetchError(f"request failed: {type(exc).__name__}") from exc
        if response.status_code != httpx.codes.OK:
            raise _error_from(response)
        if len(response.content) > BLIZZARD_MAX_BYTES:
            raise PriceFetchError(
                f"answer is {len(response.content)} bytes, over the {BLIZZARD_MAX_BYTES} cap", status_code=200,
            )
        return response

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            body = json.loads(response.content)
        except ValueError as exc:
            raise PriceFetchError("answer is not JSON", status_code=response.status_code) from exc
        if not isinstance(body, dict):
            raise PriceFetchError("answer is not a JSON object", status_code=response.status_code)
        return body

    async def _fetch_token(self) -> str:
        response = await self._send(
            "POST", BLIZZARD_TOKEN_URL, data={"grant_type": "client_credentials"}, auth=self._credentials,
        )
        token = self._json(response).get("access_token")
        if not isinstance(token, str) or not token:
            raise PriceFetchError("token answer has no access_token", status_code=response.status_code)
        return token

    async def _get(self, path: str) -> httpx.Response:
        return await self._send(
            "GET",
            f"{BLIZZARD_API_BASE}{path}",
            params={"namespace": BLIZZARD_NAMESPACE, "locale": BLIZZARD_LOCALE},
            headers={"Authorization": f"Bearer {self._token}"},
        )

    async def houses(self) -> list[AuctionHouse]:
        """Every house in the index whose name says its faction. An unknown name is logged and left out."""
        body = self._json(await self._get(f"/data/wow/ruleset/{BLIZZARD_RULESET_ID}/auctions/"))
        rows = body.get("auctions")
        if not isinstance(rows, list):
            raise PriceFetchError("auction-house index has no auctions list", status_code=200)
        houses: list[AuctionHouse] = []
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("id"), int):
                continue
            faction = HOUSE_NAME_FACTIONS.get(str(row.get("name", "")))
            if faction is None:
                logger.warning("blizzard auctions: house %s has an unknown name %r — skipped", row["id"], row.get("name"))
                continue
            houses.append(AuctionHouse(id=row["id"], faction=faction))
        return houses

    async def house_auctions(self, house_id: int, *, commodities: bool) -> HouseAuctions:
        path = f"/data/wow/ruleset/{BLIZZARD_RULESET_ID}/auctions/{house_id}"
        response = await self._get(f"{path}/commodities" if commodities else path)
        rows = self._json(response).get("auctions", [])
        if not isinstance(rows, list):
            raise PriceFetchError(f"house {house_id} answer has no auctions list", status_code=200)
        return HouseAuctions(auctions=[r for r in rows if isinstance(r, dict)], snapshot_at=_snapshot_time(response))
