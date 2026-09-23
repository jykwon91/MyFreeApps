"""Dust2 (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Dust2: a-site b-site a-long a-short b-tunnels mid catwalk t-spawn ct-spawn.
# Written from the current CS2 community callouts; the layout has not been reworked in CS2. Radar:
# T spawn at the bottom, CT spawn top-centre between the sites, A upper right (Long up the right
# edge), B upper left (Tunnels below it), Mid the vertical lane in the centre. Bare generic words
# ("doors", "car", "default", "plat", "platform", "window", "site", "back site", "ramp", "boxes",
# "spawn", "ct") are deliberately NOT keys: each has an A and a B (or T and CT) sense on this map,
# and a bare "ct" would swallow "CT SIDE - ..." chapter headers.
DUST2_CALLOUTS = [
    ("t spawn", "t-spawn"), ("terrorist spawn", "t-spawn"),
    ("t ramp", "t-spawn"), ("t plat", "t-spawn"),
    # Suicide is the covered drop from T spawn toward Top Mid: spawn-side staging, not the lane.
    ("suicide", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"),
    # --- A side, T route: Outside Long -> Long Doors -> Long -> A --------------------------------
    ("a long", "a-long"), ("long a", "a-long"), ("long", "a-long"),
    ("outside long", "a-long"), ("long doors", "a-long"), ("a long doors", "a-long"),
    # Blue is the container past Long Doors; Pit the dip at the CT end of Long. One of each.
    ("blue", "a-long"), ("pit", "a-long"), ("side pit", "a-long"), ("pit plat", "a-long"),
    ("long corner", "a-long"), ("a long corner", "a-long"),
    # A Car is at the top of Long before the ramp. B also has a car, so never a bare "car".
    ("a car", "a-long"), ("long car", "a-long"),
    ("a site", "a-site"), ("bombsite a", "a-site"), ("site a", "a-site"),
    ("a default", "a-site"), ("a plat", "a-site"), ("a platform", "a-site"),
    ("a ramp", "a-site"), ("a boxes", "a-site"), ("a back site", "a-site"), ("back a", "a-site"),
    ("ninja", "a-site"), ("a ninja", "a-site"), ("goose", "a-site"), ("barrels", "a-site"),
    ("elevator", "a-site"), ("elevators", "a-site"),
    # Cross = the gap at the top of Long where CTs cross to A; Mid Cross is keyed under mid.
    ("cross", "a-site"), ("a cross", "a-site"), ("long cross", "a-site"),
    # --- Short: the stairs from the top of Catwalk onto A; Catwalk is the walkway above mid -----
    ("a short", "a-short"), ("short a", "a-short"), ("short", "a-short"),
    ("short stairs", "a-short"), ("stairs", "a-short"), ("short boost", "a-short"),
    ("catwalk", "catwalk"), ("cat walk", "catwalk"), ("cat", "catwalk"), ("mid catwalk", "catwalk"),
    # --- middle: Top Mid -> Mid Doors -> CT Mid, with Xbox at the foot of Catwalk -----------------
    ("mid", "mid"), ("middle", "mid"), ("top mid", "mid"), ("lower mid", "mid"),
    ("right side mid", "mid"), ("palm", "mid"),
    ("mid doors", "mid"), ("close mid doors", "mid"), ("ct mid", "mid"), ("mid cross", "mid"),
    ("xbox", "mid"), ("x box", "mid"),
    # Mid to B is the CT corridor from CT Mid to B Doors; its smoke lands mid-side of B Doors.
    ("mid to b", "mid"),
    # --- B side, T route: Upper/Lower Tunnels -> B ------------------------------------------------
    ("b tunnels", "b-tunnels"), ("tunnels", "b-tunnels"), ("tunnel", "b-tunnels"),
    ("tuns", "b-tunnels"), ("b tuns", "b-tunnels"),
    ("upper tunnels", "b-tunnels"), ("upper b tunnels", "b-tunnels"), ("upper tuns", "b-tunnels"),
    ("lower tunnels", "b-tunnels"), ("lower b tunnels", "b-tunnels"), ("lower tuns", "b-tunnels"),
    ("outside tunnels", "b-tunnels"), ("outside tuns", "b-tunnels"),
    ("b site", "b-site"), ("bombsite b", "b-site"), ("site b", "b-site"),
    ("b default", "b-site"), ("b plat", "b-site"), ("b platform", "b-site"), ("back plat", "b-site"),
    ("b window", "b-site"), ("b doors", "b-site"), ("b door", "b-site"),
    ("b car", "b-site"), ("b closet", "b-site"), ("closet", "b-site"),
    ("b close", "b-site"), ("fence", "b-site"), ("b fence", "b-site"),
    ("big box", "b-site"), ("double stack", "b-site"), ("b boxes", "b-site"),
    ("scaffolding", "b-site"), ("scaffold", "b-site"),
    ("b back site", "b-site"), ("b backsite", "b-site"), ("back b", "b-site"), ("back of b", "b-site"),
]
