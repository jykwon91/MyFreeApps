"""Auction-house price constants for the WoW Forever companion.

Regions are Blizzard's (an auction house never spans two of them). Sources are
the price providers ``app/services/wow/prices/`` knows; each needs a CHECK
value here AND in the migration that adds it. The credit text and link are what
the page must show next to any price from that source.
"""
from typing import Final, Literal, get_args

WOW_FOREVER_GAME_SLUG: Final = "wow-forever"

PriceRegion = Literal["us", "eu", "kr", "tw"]
PRICE_REGIONS: Final[tuple[str, ...]] = get_args(PriceRegion)
DEFAULT_PRICE_REGION: Final = "us"

PRICE_SOURCE_TSM: Final = "tsm"
PRICE_SOURCES: Final = (PRICE_SOURCE_TSM,)

PRICE_SOURCE_CREDITS: Final = {
    PRICE_SOURCE_TSM: ("TradeSkillMaster", "https://www.tradeskillmaster.com"),
}

# TradeSkillMaster's public region files: one CSV per region, no key, no sign-in.
TSM_REGION_URL: Final = "https://public-data.tradeskillmaster.com/forever/{region}/region/items.csv"
TSM_TIMEOUT_SECONDS: Final = 30.0
# A region file is ~65 KB today; anything past this is not the file we expect.
TSM_MAX_BYTES: Final = 5 * 1024 * 1024
