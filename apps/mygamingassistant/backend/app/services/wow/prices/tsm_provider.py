"""TradeSkillMaster's public WoW Forever region files as a PriceProvider.

``GET https://public-data.tradeskillmaster.com/forever/{region}/region/items.csv``
— no key, no sign-in, no published rate limit. The files are served with an
``ETag`` + ``Last-Modified`` and ``Cache-Control: max-age=14400`` (seen
2026-11-06), so every refresh is a conditional GET and an unchanged file costs
a 304. TSM pools every ruleset in a region, so ``ruleset`` is None.

Credit: the page shows "Prices from TradeSkillMaster" with a link wherever a
price from here is shown (``PRICE_SOURCE_CREDITS``).
"""
from __future__ import annotations

import httpx

from app.core.wow_prices import PRICE_SOURCE_TSM, TSM_MAX_BYTES, TSM_REGION_URL, TSM_TIMEOUT_SECONDS
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_fetch_result import PriceFetchResult
from app.services.wow.prices.tsm_csv import parse_tsm_csv

USER_AGENT = "MyGamingAssistant/1.0 (+https://mygamingassistant.myfreeapps.org/wow-forever)"


class TsmPriceProvider:
    source = PRICE_SOURCE_TSM
    ruleset: str | None = None

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        # Tests pass an httpx.MockTransport; production uses the default.
        self._transport = transport

    async def fetch(self, region: str, *, etag: str | None, last_modified: str | None) -> PriceFetchResult:
        headers = {"User-Agent": USER_AGENT, "Accept": "text/csv"}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        url = TSM_REGION_URL.format(region=region)
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=TSM_TIMEOUT_SECONDS, follow_redirects=True,
            ) as client:
                response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise PriceFetchError(f"request failed: {type(exc).__name__}: {exc}") from exc

        if response.status_code == httpx.codes.NOT_MODIFIED:
            return PriceFetchResult(not_modified=True)
        if response.status_code != httpx.codes.OK:
            raise PriceFetchError(response.text[:200] or response.reason_phrase, status_code=response.status_code)
        if len(response.content) > TSM_MAX_BYTES:
            raise PriceFetchError(f"file is {len(response.content)} bytes, over the {TSM_MAX_BYTES} cap", status_code=200)

        return PriceFetchResult(
            not_modified=False,
            prices=parse_tsm_csv(response.text),
            etag=response.headers.get("ETag"),
            last_modified=response.headers.get("Last-Modified"),
        )
