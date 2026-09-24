"""Ancient (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Ancient: a-site b-site a-main b-main mid t-spawn ct-spawn. Radar: T spawn at the
# bottom, CT spawn at the top, A on the upper LEFT (A Main runs up the left side), B on the RIGHT
# (B Ramp/B Main below it), Mid the central lane with Donut off its A side and Cave off its B side.
# Where a callout's zone was ambiguous across community guides, the mapping follows the zones the
# accepted NartOutHere Ancient rows (ancient_accept.json) already used, and what Tigerr's /
# GettClutch's 2026 guides show thrown there. The 2025 update removed the Temple -> A Main angle;
# Temple is still the enclosed structure at the back of A Site.
# Bare generic words ("site", "doors", "default", "ct", "spawn", "long", "short", "boxes",
# "stairs") are deliberately NOT keys: each has an A and a B (or T and CT) sense on this map, and a
# bare "ct" would swallow "CT SIDE - ..." chapter headers.
ANCIENT_CALLOUTS = [
    ("t spawn", "t-spawn"), ("terrorist spawn", "t-spawn"), ("t side spawn", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"),
    # --- A side, T route: A Main -> onto A Site; Temple and the boxes sit at the back ------------
    ("a main", "a-main"), ("main a", "a-main"), ("a ramp", "a-main"), ("a stairs", "a-main"),
    ("outside a", "a-main"),
    ("a site", "a-site"), ("bombsite a", "a-site"), ("site a", "a-site"),
    ("a default", "a-site"), ("a box", "a-site"), ("a boxes", "a-site"),
    ("a back site", "a-site"), ("a backsite", "a-site"), ("back a", "a-site"),
    ("temple", "a-site"), ("a temple", "a-site"), ("triple", "a-site"),
    # Donut is the round room linking Mid to A; its smoke exists to cut the Mid -> A rotation, and
    # the accepted rows put its target on A. "Mid donut" titles still resolve to mid (leftmost).
    ("donut", "a-site"), ("a donut", "a-site"),
    # --- middle: T Mid -> Mid -> Top Mid, with Red Room / Window / Heaven the CT-side perches ------
    ("mid", "mid"), ("middle", "mid"), ("top mid", "mid"), ("ct mid", "mid"), ("t mid", "mid"),
    ("red room", "mid"), ("red", "mid"), ("window", "mid"), ("mid window", "mid"),
    ("cubby", "mid"),
    # Heaven on Ancient is the raised CT walkway over Mid (Tigerr: "also called bridge / lane"),
    # not a site balcony; Elbow is the Mid choke toward CT that both sides throw at from spawn.
    ("heaven", "mid"), ("mid heaven", "mid"), ("elbow", "mid"), ("anti elbow", "mid"),
    # --- B side, T route: B Ramp / B Main -> B Site, with Cave the Mid -> B passage ---------------
    ("b main", "b-main"), ("main b", "b-main"), ("b ramp", "b-main"), ("ramp", "b-main"),
    ("cave", "b-main"), ("b cave", "b-main"),
    ("b site", "b-site"), ("bombsite b", "b-site"), ("site b", "b-site"),
    ("b default", "b-site"), ("b back site", "b-site"), ("b backsite", "b-site"),
    ("back b", "b-site"), ("back of b", "b-site"),
    ("pillar", "b-site"), ("b pillar", "b-site"),
    ("b doors", "b-site"), ("b door", "b-site"),
    # Long / Short / Lane are the CT entrances onto B that a B execute smokes off.
    ("b long", "b-site"), ("long b", "b-site"), ("b short", "b-site"), ("short b", "b-site"),
    ("b lane", "b-site"), ("lane", "b-site"),
    # Cheetah, Jaguar (statues) and Banana are B-site spots in the accepted rows.
    ("cheetah", "b-site"), ("jaguar", "b-site"), ("banana", "b-site"),
]
