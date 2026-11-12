"""Blizzard Profile API settings for "Your character" (WoW Forever, US).

Forever characters are named first + surname and live on no realm: Blizzard
addresses them as ``/profile/wow/character/{first}-{surname}`` in the
``profile-forever-us`` namespace, readable with a client-credentials token
(checked 2026-11-11 against a real character).
"""
import re
from datetime import timedelta
from typing import Final

CHARACTER_NAMESPACE: Final = "profile-forever-us"
CHARACTER_PATH: Final = "/profile/wow/character"
CHARACTER_TIMEOUT_SECONDS: Final = 15.0
# A profile or equipment answer is ~10-60 KB; a render PNG is ~0.5-1 MB.
CHARACTER_MAX_JSON_BYTES: Final = 2 * 1024 * 1024
CHARACTER_MAX_RENDER_BYTES: Final = 8 * 1024 * 1024

# Gear changes when the player logs in again; a few minutes keeps a refresh honest
# while a page full of re-renders asks Blizzard once.
CHARACTER_CACHE_SECONDS: Final = 300
CHARACTER_CACHE_MAX_ENTRIES: Final = 500
# Cropped renders are up to ~1 MB each, so fewer of them are kept.
CHARACTER_RENDER_CACHE_MAX_ENTRIES: Final = 100

# Each name is letters only (any alphabet), 2-24 long; the slug is both, lowercased, joined by "-".
CHARACTER_SLUG_PATTERN: Final = re.compile(r"^[^\W\d_]{2,24}-[^\W\d_]{2,24}$")

# The render is fetched only from Blizzard's render host, over HTTPS.
CHARACTER_RENDER_HOST: Final = "render.worldofwarcraft.com"
CHARACTER_RENDER_ASSET: Final = "main-raw"
# Transparent margin kept around the cropped figure, as a share of its size.
CHARACTER_RENDER_PADDING: Final = 0.06
# Blizzard's render is 1600x1200; anything far bigger is refused before it is
# decoded (a small PNG can inflate to gigabytes of pixels).
CHARACTER_RENDER_MAX_PIXELS: Final = 3200 * 2400

# Lookups per IP: each uncached one is up to twelve Blizzard calls (token, profile, media, equipment and the
# optional parts).
CHARACTER_RATE_LIMIT: Final = 30
CHARACTER_RATE_WINDOW_SECONDS: Final = 60

# Statistic ids in Blizzard's ``/achievements/statistics`` (the client's Achievement
# rows; the same ids in every character's answer, checked 2026-11-12). A statistic
# the character has never moved is left out of the answer, so absent = 0.
STATISTIC_DEATHS_FROM_PLAYERS: Final = 1501
STATISTIC_DEATHS_FROM_OPPOSITE_FACTION: Final = 318
# Its quantity is the kills there; its description names the continent.
STATISTIC_TOP_HONOR_CONTINENT: Final = 1458
# "Total 5-player dungeons entered".
STATISTIC_DUNGEONS_ENTERED: Final = 932

# An item under this share of its durability is flagged "repair soon".
CHARACTER_DURABILITY_LOW_SHARE: Final = 0.5
# More ids from the same answer, for the stored daily history (checked 2026-11-12).
STATISTIC_TOTAL_KILLS: Final = 1197
STATISTIC_KILLING_BLOWS: Final = 1487
STATISTIC_TOTAL_DEATHS: Final = 60

# A reputation tier of 7 is Exalted (0 = Hated).
REPUTATION_TIER_EXALTED: Final = 7

# Stored characters (``wow_character``): bump when a ``CharacterResponse`` change
# means a stored sheet no longer reads as the same thing (a rename, a removal, a
# new meaning). A stored sheet of another version is ignored until it is fetched
# again. ``test_wow_character_store`` pins the schema's hash to this number.
CHARACTER_SHEET_VERSION: Final = 1
# Daily history rows older than this are purged (a character's newest row is kept).
CHARACTER_METRIC_RETENTION: Final = timedelta(days=400)
CHARACTER_METRIC_PURGE_INTERVAL_HOURS: Final = 24
# ``wow_character.last_error``'s size; a longer error is cut to it.
CHARACTER_ERROR_MAX_LENGTH: Final = 500

# ``wow_recipe.name``'s size; a longer recipe name is cut to it.
RECIPE_NAME_MAX_LENGTH: Final = 120
