"""Auction-house price constants for the WoW Forever companion.

Prices are US only (operator decision, 2026-11-08) and come from Blizzard's
Game Data API: the auction houses of the Forever US region. Every house is
its own market — one server's Alliance, Horde or neutral Blackwater house —
so prices are stored and served PER HOUSE, never pooled. Regions and
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

# Which Blizzard auction house is which server's market. Blizzard's index
# names a house only by faction ("Alliance Auction House") and never says
# which server it belongs to, so this mapping is the ONLY place a server
# gets its houses. The houses come in faction triples by id (Alliance,
# Horde, Blackwater): (110, 113, 116), (111, 114, 117), (112, 115, 118 —
# empty on 2026-11-09), (119, 120, 121), (123, 124, 125).
#
# MAPPED: pvp = (110, 113, 116). Verified 2026-11-09 by the operator on a PvP
# server's Alliance AH: Blue Pearl ~40s and Stonescale Eel ~4s match house
# 110 and no other Alliance house.
#
# UNMAPPED: every other triple. Their server types are unknown — never guess
# a label for one. To map a server, the operator notes an item's price on
# that server's AH in game (pick one that differs a lot between houses, e.g.
# Blue Pearl 4611 or Stonescale Eel 13422), compares it with every house's
# cheapest listing (`python -m app.cli wow-house-prices <item id>`), then
# adds the matching triple below under a new key, the same key to
# `PriceServer`, and a label in the frontend's `data/priceServers.ts`. No
# migration: feeds are keyed by house id, never by server. The refresh
# fetches only mapped houses; the API accepts every mapped ?server=.
PriceServer = Literal["pvp"]
PRICE_SERVERS: Final[tuple[str, ...]] = get_args(PriceServer)
DEFAULT_PRICE_SERVER: Final[PriceServer] = "pvp"
PRICE_SERVER_HOUSES: Final[dict[str, dict[str, int]]] = {
    "pvp": {"alliance": 110, "horde": 113, "neutral": 116},
}

# Blizzard Game Data API. A client-credentials token, then the ruleset's
# auction-house index and each mapped house's listings. Every ruleset path
# (1/2/3/15) returns the same data for a given house id (checked 2026-11-09),
# so the house id alone identifies the market and one ruleset is read.
BLIZZARD_TOKEN_URL: Final = "https://oauth.battle.net/token"
BLIZZARD_API_BASE: Final = "https://us.api.blizzard.com"
BLIZZARD_NAMESPACE: Final = "dynamic-forever-us"
BLIZZARD_LOCALE: Final = "en_US"
BLIZZARD_RULESET_ID: Final = 1
BLIZZARD_TIMEOUT_SECONDS: Final = 60.0
# The largest house answer is ~10 MB today; anything past this is not what we expect.
BLIZZARD_MAX_BYTES: Final = 64 * 1024 * 1024

# The auction-house index names each house; its name is its faction. A
# mapped house whose name says another faction (or that the index no longer
# lists) is refused: the mapping is wrong, or Blizzard renumbered the houses.
HOUSE_NAME_FACTIONS: Final[dict[str, PriceFaction]] = {
    "Alliance Auction House": "alliance",
    "Horde Auction House": "horde",
    "Blackwater Auction House": "neutral",
}

# Market value = the unit price below which this share of the house's listed
# units sits. A low quantile is what a buyer actually pays, and a single
# troll listing (one unit far below or above the rest) can't move it.
MARKET_VALUE_QUANTILE: Final = 0.10
