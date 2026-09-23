"""Inferno (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Inferno: a-site b-site a-long banana mid second-mid t-spawn ct-spawn. The first
# CS2 table: no Riot readout to derive from, so it is written from the community callouts and each
# family is placed by the side of the map it belongs to. Apartments has no zone of its own and is
# deliberately ABSENT -- an apartments stand fails loud in the pack builder rather than silently
# landing on a neighbour.
INFERNO_CALLOUTS = [
    ("t spawn", "t-spawn"), ("t ramp", "t-spawn"), ("terrorist spawn", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"),
    # --- B side: the banana climbs from T side to B ---------------------------------------------
    ("top banana", "banana"), ("bottom banana", "banana"), ("banana", "banana"),
    ("half wall", "banana"), ("sandbags", "banana"), ("car", "banana"), ("logs", "banana"),
    ("b site", "b-site"), ("bombsite b", "b-site"), ("site b", "b-site"),
    ("fountain", "b-site"), ("coffins", "b-site"), ("coffin", "b-site"), ("new box", "b-site"),
    ("dark", "b-site"), ("construction", "b-site"), ("cons", "b-site"), ("spools", "b-site"),
    ("first orange", "b-site"), ("second orange", "b-site"), ("oranges", "b-site"),
    ("church", "b-site"), ("patio", "b-site"),
    # --- A side ---------------------------------------------------------------------------------
    ("a site", "a-site"), ("bombsite a", "a-site"), ("site a", "a-site"),
    ("pit", "a-site"), ("graveyard", "a-site"), ("library", "a-site"), ("arch", "a-site"),
    ("truck", "a-site"), ("triple", "a-site"), ("short", "a-site"), ("short a", "a-site"),
    ("moto", "a-site"), ("a default", "a-site"),
    ("long", "a-long"), ("a long", "a-long"), ("long a", "a-long"), ("long hall", "a-long"),
    # --- middle ---------------------------------------------------------------------------------
    ("second mid", "second-mid"), ("2nd mid", "second-mid"),
    ("top mid", "mid"), ("alt mid", "mid"), ("mid", "mid"),
]
