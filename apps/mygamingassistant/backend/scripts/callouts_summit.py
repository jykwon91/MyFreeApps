"""Summit callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Callout -> coarse map-zone slug, PER MAP. Longest match first, so "bottom mid" beats "mid"
# and "b gym" beats "b".
#
# Keyed on the pack's own map_slug and FAILS LOUD for a map with no table: falling back to
# Summit's would silently map (say) an Ascent "Market" callout onto a Summit zone that doesn't
# exist on Ascent, and the only symptom would be wrong pins at the operator's eyeball gate.
#
# Zones seeded for Summit: a-site b-site a-main b-main mid t-spawn ct-spawn.
SUMMIT_CALLOUTS = [
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"), ("ct spawn", "ct-spawn"),
    ("t spawn", "t-spawn"), ("b heaven", "b-site"), ("a heaven", "a-site"),
    ("mid fountain", "mid"), ("mid bottom", "mid"), ("bottom mid", "mid"),
    ("mid tiles", "mid"), ("mid bend", "mid"), ("mid top", "mid"), ("top mid", "mid"),
    ("a garden", "a-site"), ("a lobby", "a-main"), ("b lobby", "b-main"),
    ("a link", "mid"), ("b link", "mid"), ("a cave", "a-site"), ("a art", "a-site"),
    ("b drop", "b-site"), ("b hut", "b-site"), ("b gym", "ct-spawn"),
    # Community plant-spot names, same family rule as the Ascent and Sunset tables. Added late:
    # Summit's titles carry a "from <stand>" clause, so before target_text() stripped it these
    # resolved off the STAND ("A Default from A Lobby" -> a-main) and the gap never showed. The
    # zones here are not inferred — they are what the 16 already-accepted rows from 3GUKAYiurQk
    # actually store (a-site for A Default / A Open, b-site for B Default), read back out of the DB
    # by check_ingested_regression.py. Without these a Summit rebuild would silently drop all 16.
    ("a default", "a-site"), ("b default", "b-site"),
    ("a open", "a-site"), ("b open", "b-site"),
    ("a main", "a-main"), ("b main", "b-main"), ("a site", "a-site"), ("b site", "b-site"),
    ("fountain", "mid"), ("tiles", "mid"), ("middle", "mid"), ("garden", "a-site"),
    ("heaven", "b-site"), ("gym", "ct-spawn"), ("mid", "mid"), ("ct", "ct-spawn"),
]
