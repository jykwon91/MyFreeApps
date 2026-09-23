"""Mirage (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Mirage: a-site b-site a-ramp a-palace b-apts b-van mid top-mid catwalk window
# market connector ticket-booth jungle stairs t-spawn ct-spawn.
# Written from the current (2026) community callouts. Radar: T spawn on the right, CT spawn at the
# bottom-left behind A, A site at the bottom, B at the top-left, Mid the long lane between them.
# Keys are in normalized form ("sniper s nest"); a hyphenated key could never match. Bare generic
# words ("site", "default", "door", "doors", "pillar", "boost", "cart", "empty", "truck") are
# deliberately NOT keys: each has more than one sense on this map, or is ordinary English.
MIRAGE_CALLOUTS = [
    ("t spawn", "t-spawn"), ("terrorist spawn", "t-spawn"),
    # T Roof is the raised ledge outside A Ramp nearest T spawn; House / T Apartments and Back Alley
    # are the T-side buildings between spawn and B Apartments. All are staging space, not a lane.
    ("t roof", "t-spawn"), ("house", "t-spawn"), ("t apartments", "t-spawn"),
    ("t apps", "t-spawn"), ("back alley", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"),
    # "CT" unqualified is the CT-spawn entrance onto A (the "CT smoke" of the A execute). It sits in
    # the spawn mouth, so it resolves to ct-spawn rather than the site.
    ("ct", "ct-spawn"), ("ct entrance", "ct-spawn"), ("trash", "ct-spawn"),
    ("ticket booth", "ticket-booth"), ("ticket", "ticket-booth"), ("tickets", "ticket-booth"),
    ("booth", "ticket-booth"),
    # --- A side: T route A Ramp (or Palace) onto the site -----------------------------------------
    # "Pit" / "A Main" are alternate names for the T approach up A Ramp. Bare "ramp" is A Ramp: the
    # only other ramp is Apps Ramp, and that title always leads with "apps".
    ("a ramp", "a-ramp"), ("ramp", "a-ramp"), ("ramp a", "a-ramp"), ("pit", "a-ramp"),
    ("a main", "a-ramp"),
    # Palace plus its parts: Pillars inside, Balcony out over the site, Shadows under Balcony.
    ("palace", "a-palace"), ("a palace", "a-palace"), ("palace pillars", "a-palace"),
    ("pillars", "a-palace"), ("balcony", "a-palace"), ("palace balcony", "a-palace"),
    ("shadows", "a-palace"),
    ("a site", "a-site"), ("bombsite a", "a-site"), ("site a", "a-site"), ("a default", "a-site"),
    ("triple", "a-site"), ("triple box", "a-site"), ("triple boxes", "a-site"),
    ("firebox", "a-site"), ("fire box", "a-site"), ("ninja", "a-site"), ("a ninja", "a-site"),
    # Tetris (box stack at the top of A Ramp) and Sandwich (alcove between Stairs and Tetris) are CT
    # holds on the site itself, not the ramp the T walks up.
    ("tetris", "a-site"), ("sandwich", "a-site"),
    ("stairs", "stairs"), ("a stairs", "stairs"), ("stairs a", "stairs"),
    ("jungle", "jungle"), ("a jungle", "jungle"),
    ("connector", "connector"), ("a connector", "connector"), ("mid connector", "connector"),
    # --- middle: Top Mid -> Mid -> Window / Connector / Catwalk -----------------------------------
    ("top mid", "top-mid"), ("mid boxes", "top-mid"), ("side alley", "top-mid"),
    ("mid", "mid"), ("middle", "mid"), ("bottom mid", "mid"), ("chair", "mid"),
    # Underpass runs from B Apartments under Catwalk and comes out at the bottom of Mid.
    ("underpass", "mid"),
    # Window = the Mid AWP perch (Sniper's Nest); Market Window is keyed below. Ladder Room sits
    # behind it and Vent links it to CT spawn; both are Window's back rooms.
    ("window", "window"), ("mid window", "window"), ("sniper s nest", "window"),
    ("snipers nest", "window"), ("sniper nest", "window"), ("ladder room", "window"),
    ("ladder", "window"), ("vent", "window"),
    # Mirage has no A "short": "Short" is always B Short, the Catwalk entrance onto B from Mid.
    ("catwalk", "catwalk"), ("cat", "catwalk"), ("short", "catwalk"), ("b short", "catwalk"),
    ("short b", "catwalk"), ("short corner", "catwalk"),
    # --- B side: T route Apartments -> B site; CT side Market / Kitchen ---------------------------
    ("b apartments", "b-apts"), ("apartments", "b-apts"), ("apartment", "b-apts"),
    ("b apps", "b-apts"), ("apps", "b-apts"), ("b apts", "b-apts"), ("apts", "b-apts"),
    ("apps ramp", "b-apts"), ("b plat", "b-apts"),
    ("van", "b-van"), ("b van", "b-van"),
    ("b site", "b-site"), ("bombsite b", "b-site"), ("site b", "b-site"), ("b default", "b-site"),
    ("bench", "b-site"), ("b bench", "b-site"), ("arches", "b-site"), ("b arches", "b-site"),
    ("e box", "b-site"), ("ebox", "b-site"),
    ("market", "market"), ("b market", "market"), ("market door", "market"),
    ("market doors", "market"), ("market window", "market"), ("kitchen", "market"),
    ("sneaky", "market"),
]
