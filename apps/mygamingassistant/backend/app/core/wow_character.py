"""Blizzard Profile API settings for "Your character" (WoW Forever, US).

Forever characters are named first + surname and live on no realm: Blizzard
addresses them as ``/profile/wow/character/{first}-{surname}`` in the
``profile-forever-us`` namespace, readable with a client-credentials token
(checked 2026-11-11 against a real character).
"""
import re
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

# Each name is letters only (any alphabet), 2-24 long; the slug is both, lowercased, joined by "-".
CHARACTER_SLUG_PATTERN: Final = re.compile(r"^[^\W\d_]{2,24}-[^\W\d_]{2,24}$")

# The render is fetched only from Blizzard's render host, over HTTPS.
CHARACTER_RENDER_HOST: Final = "render.worldofwarcraft.com"
CHARACTER_RENDER_ASSET: Final = "main-raw"
# Transparent margin kept around the cropped figure, as a share of its size.
CHARACTER_RENDER_PADDING: Final = 0.06

# Lookups per IP: each uncached one is three Blizzard calls.
CHARACTER_RATE_LIMIT: Final = 30
CHARACTER_RATE_WINDOW_SECONDS: Final = 60

# An item under this share of its durability is flagged "repair soon".
CHARACTER_DURABILITY_LOW_SHARE: Final = 0.5
