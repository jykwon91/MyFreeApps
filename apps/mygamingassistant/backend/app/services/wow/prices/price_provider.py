"""The seam every auction-house price source implements.

TradeSkillMaster's public region files are the first provider
(``tsm_provider.py``). A Blizzard Game Data API provider would implement the
same two attributes and ``fetch``: its ``source`` gets a value in
``PRICE_SOURCES`` (+ the CHECK in a migration), and if it splits a region by
ruleset it returns one provider per ruleset label. Nothing in the tables or
the refresh service is TSM-specific.
"""
from typing import Protocol

from app.services.wow.prices.price_fetch_result import PriceFetchResult


class PriceProvider(Protocol):
    # One of ``PRICE_SOURCES``.
    source: str
    # None when the source pools every ruleset of a region.
    ruleset: str | None

    async def fetch(self, region: str, *, etag: str | None, last_modified: str | None) -> PriceFetchResult:
        """Prices for ``region``; ``not_modified`` when the validators still match.

        Raises ``PriceFetchError`` on any failure (HTTP error, network,
        unreadable body) — never returns an empty list to mean "failed".
        """
        ...
