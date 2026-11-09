"""Auction-house price constants for the WoW Forever companion.

Prices are US only (operator decision, 2026-11-08) and come from Blizzard's
Game Data API: the auction houses of the Forever US region, one price set per
faction (Alliance, Horde, and the neutral Blackwater houses). Regions and
factions each need a CHECK value here AND in the migration that adds them.
"""
from typing import Final, Literal, get_args

WOW_FOREVER_GAME_SLUG: Final = "wow-forever"

PRICE_REGION: Final = "us"
PRICE_REGIONS: Final = (PRICE_REGION,)

PriceFaction = Literal["alliance", "horde", "neutral"]
PRICE_FACTIONS: Final[tuple[str, ...]] = get_args(PriceFaction)
# What GET /wow/prices serves without ?faction= (the site's default player faction).
DEFAULT_PRICE_FACTION: Final[PriceFaction] = "alliance"

# Blizzard Game Data API. A client-credentials token, then the ruleset's
# auction-house index and each house's listings. Every ruleset lists the same
# house ids (checked 2026-11-09), so one ruleset is read.
BLIZZARD_TOKEN_URL: Final = "https://oauth.battle.net/token"
BLIZZARD_API_BASE: Final = "https://us.api.blizzard.com"
BLIZZARD_NAMESPACE: Final = "dynamic-forever-us"
BLIZZARD_LOCALE: Final = "en_US"
BLIZZARD_RULESET_ID: Final = 1
BLIZZARD_TIMEOUT_SECONDS: Final = 60.0
# The largest house answer is ~10 MB today; anything past this is not what we expect.
BLIZZARD_MAX_BYTES: Final = 64 * 1024 * 1024

# The auction-house index names each house; its name is its faction. The
# index lists several houses per faction — one per realm, each with its own
# listings — and a faction's price set pools all of them.
HOUSE_NAME_FACTIONS: Final[dict[str, PriceFaction]] = {
    "Alliance Auction House": "alliance",
    "Horde Auction House": "horde",
    "Blackwater Auction House": "neutral",
}

# Market value = the unit price below which this share of the listed units
# sits. A low quantile is what a buyer actually pays, and a single troll
# listing (one unit far below or above the rest) can't move it.
MARKET_VALUE_QUANTILE: Final = 0.10
