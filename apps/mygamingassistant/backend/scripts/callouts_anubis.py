"""Anubis (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Anubis: a-site b-site a-main b-main mid t-spawn ct-spawn.
# Written for the map AFTER the 2026-01-22 rework (Season 4): the Bridge drop hole moved to just
# outside Mid Doors, Mid Doors were flipped, a hole was cut between E-Box and B Back Site, and the
# A-site crates moved up onto Walkway with scaffolding added to the A pillar. Radar: T spawn at the
# bottom, CT spawn at the top, A on the upper right, B on the left, the Water/Bridge spine in the
# centre. Bare generic words ("main", "site", "window", "stairs", "pillar", "long", "default",
# "doors", "corner") are deliberately NOT keys: each has an A and a B (or mid) sense on this map.
ANUBIS_CALLOUTS = [
    ("t spawn", "t-spawn"), ("terrorist spawn", "t-spawn"),
    # Alley is the T-side hall directly above T spawn that fans out to Top Mid and the T Stairs;
    # it is staging space, not yet any lane, so it stays with the spawn.
    ("alley", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"),
    ("beach", "ct-spawn"),
    # Cave is the covered walkway directly below CT spawn heading toward B; Tunnel is the CT
    # indoor run from spawn toward A Heaven. Both are CT rotation space next to spawn, not a site.
    ("cave", "ct-spawn"), ("tunnel", "ct-spawn"), ("ct tunnel", "ct-spawn"),
    # --- B side: T route Ruins -> B Long -> Gate onto the site (left of the radar) --------------
    # Ruins sits between T spawn and B Long; its raised Heaven overlooks B Long. Both are the T
    # approach to B, so they sit in b-main (B Heaven is NOT A Heaven - never a bare "heaven" here).
    ("ruins", "b-main"), ("b heaven", "b-main"), ("ruins heaven", "b-main"),
    ("b long", "b-main"), ("long b", "b-main"), ("b main", "b-main"), ("main b", "b-main"),
    ("ivy", "b-main"),
    ("b site", "b-site"), ("bombsite b", "b-site"), ("site b", "b-site"),
    ("gate", "b-site"), ("b gate", "b-site"), ("b corner", "b-site"), ("b default", "b-site"),
    ("b pillar", "b-site"), ("pillar b", "b-site"), ("ninja", "b-site"), ("b ninja", "b-site"),
    ("backsite", "b-site"), ("back site", "b-site"), ("b backsite", "b-site"),
    ("b back site", "b-site"), ("back b", "b-site"), ("back of b", "b-site"),
    # E-Box is the room linking the Water under Bridge to B; it opens onto the site beside
    # Pillar/Ninja, and since 2026-01-22 has a hole through to Back Site, so it belongs to B.
    ("e box", "b-site"), ("ebox", "b-site"),
    ("e box hole", "b-site"), ("ebox hole", "b-site"),
    ("b hole", "b-site"), ("b window", "b-site"),
    # Bare "hole" = the 2026 E-Box -> Back Site cut, the opening the patch notes call a "hole".
    # The moved Bridge drop is keyed separately below as "bridge hole".
    ("hole", "b-site"),
    # "Connector" in B-execute sets (Street / Temple / Connector) is the E-Box/Ninja entrance.
    ("b connector", "b-site"), ("connector ninja", "b-site"), ("connect ninja", "b-site"),
    # CT approaches onto B: Street runs down from Sniper straight into the site; Sniper is the
    # raised CT perch at the head of Street whose only job is holding B.
    ("street", "b-site"), ("b street", "b-site"), ("sniper", "b-site"),
    # Palace (a.k.a. Temple) is the statue building between Middle and B Back Site; it is the CT
    # rotation that opens straight onto Back Site, and B executes smoke it as a B entrance.
    ("palace", "b-site"), ("temple", "b-site"),
    # --- A side: T route Alley -> T Stairs -> Boat -> A Main (right of the radar) ---------------
    ("a main", "a-main"), ("main a", "a-main"),
    ("boat", "a-main"), ("upper", "a-main"), ("wood", "a-main"),
    # "Drop" on the radar is the Upper -> Boat drop; the moved mid drop is "bridge drop" (mid).
    ("drop", "a-main"), ("boat drop", "a-main"),
    # T Stairs lead down from Alley into the Boat/Wood pocket, the entrance to A Main.
    ("t stairs", "a-main"), ("stairs t", "a-main"),
    ("a site", "a-site"), ("bombsite a", "a-site"), ("site a", "a-site"),
    ("a default", "a-site"), ("a pillar", "a-site"), ("scaffolding", "a-site"),
    ("scaffold", "a-site"), ("walkway", "a-site"), ("a walkway", "a-site"),
    ("fountain", "a-site"), ("back a", "a-site"), ("back a site", "a-site"),
    ("a back site", "a-site"), ("a backsite", "a-site"),
    # Heaven: A Heaven is the one lineup videos mean unqualified; B Heaven is keyed above.
    ("heaven", "a-site"), ("a heaven", "a-site"),
    ("plat", "a-site"), ("a plat", "a-site"), ("platform", "a-site"), ("a platform", "a-site"),
    ("plateau", "a-site"),
    # Headshot is the box angle at the top of A Main where Main opens onto the site; a CT hold.
    ("headshot", "a-site"),
    # Camera = the A Connector tunnel from Middle onto Plateau/A; it opens onto the site
    # (the 2026 scaffolding exists to kill the Heaven <-> Camera angle during retakes).
    ("camera", "a-site"), ("a camera", "a-site"),
    ("a connector", "a-site"), ("connector a", "a-site"), ("a con", "a-site"),
    # --- middle: Top Mid -> Bridge over the Water -> Mid (Double) Doors -> Middle ---------------
    ("top mid", "mid"), ("mid", "mid"), ("middle", "mid"), ("deep mid", "mid"),
    ("ct mid", "mid"), ("mid doors", "mid"), ("double doors", "mid"), ("double door", "mid"),
    ("bridge", "mid"), ("bridge drop", "mid"), ("bridge hole", "mid"), ("mid hole", "mid"),
    ("mid window", "mid"), ("cubby", "mid"), ("house", "mid"), ("mid camera", "mid"),
    # The Water/Canal is the central channel under Bridge; it feeds BOTH E-Box (B) and Boat (A),
    # so it belongs to neither lane. Arches are the T-side lip of the same water.
    ("water", "mid"), ("the water", "mid"), ("mid water", "mid"),
    ("canal", "mid"), ("canals", "mid"), ("arches", "mid"),
    # Bare "connector": both connectors (A Connector/Camera, E-Box/B) start from the central area.
    ("connector", "mid"),
]
