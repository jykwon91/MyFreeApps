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

import asyncio
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
    HOUSE_NAME_FACTIONS,
)
from app.services.wow.blizzard.blizzard_http import USER_AGENT, fetch_client_token, json_object, send
from app.services.wow.prices.auction_house import AuctionHouse
from app.services.wow.prices.house_auctions import HouseAuctions
from app.services.wow.prices.price_fetch_error import PriceFetchError

logger = logging.getLogger(__name__)

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
        return await send(
            self._http, method, url, error_cls=PriceFetchError, max_bytes=BLIZZARD_MAX_BYTES, **kwargs,
        )

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        return json_object(response, PriceFetchError)

    async def _fetch_token(self) -> str:
        if self._http is None:
            raise RuntimeError("BlizzardAuctionClient used outside `async with`")
        token = await fetch_client_token(
            self._http, self._credentials, error_cls=PriceFetchError, max_bytes=BLIZZARD_MAX_BYTES,
        )
        return token.value

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
        # Up to BLIZZARD_MAX_BYTES of JSON: parse it off the event loop so the
        # scheduler's tick and heartbeat keep running meanwhile.
        rows = await asyncio.to_thread(self._auction_rows, house_id, response)
        return HouseAuctions(auctions=rows, snapshot_at=_snapshot_time(response))

    @classmethod
    def _auction_rows(cls, house_id: int, response: httpx.Response) -> list[dict[str, Any]]:
        rows = cls._json(response).get("auctions", [])
        if not isinstance(rows, list):
            raise PriceFetchError(f"house {house_id} answer has no auctions list", status_code=200)
        return [r for r in rows if isinstance(r, dict)]
