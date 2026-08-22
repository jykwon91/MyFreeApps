"""Lotus callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Lotus: a-site b-site C-SITE a-main b-main C-MAIN mid t-spawn ct-spawn — the only
# map with three sites AND three mains AND a mid, so nine zones.
#
# Six of Lotus's 28 Riot callouts have a name that disagrees with the nearest zone box, more than any
# other map. They were settled by `zone_rank.py lotus "<callout>"` (full ranking, not just nearest)
# under one rule, applied uniformly:
#
#   Geometry overrides the name ONLY when the nearest box is both CLOSE (d <= ~0.11) and beats the
#   name's own family by a clear margin (~2x). Otherwise the name wins.
#
# The absolute-distance half of that test is what stops the ratio from misfiring: C Lobby's nearest
# box is t-spawn at d=0.120 and beats c-main (0.234) by 1.95x, but NOTHING is close to C Lobby, so
# the ranking carries no information and calling an attacker approach corridor "defender spawn" would
# be plainly wrong. Same for A Lobby (0.113) and C Gravel (0.140, where the top three are within
# 0.015 of each other and thus a coin flip).
LOTUS_CALLOUTS = [
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # --- the six name/geometry conflicts, each with its ranking ---------------------------------
    # NAME WINS — nearest box is far, so the geometry is uninformative:
    ("a lobby", "a-main"),    # t-spawn 0.113 / a-main 0.137 — far; family, and matches every map
    ("c lobby", "c-main"),    # t-spawn 0.120 / b-main 0.202 / c-main 0.234 — all far
    ("c gravel", "c-site"),   # mid 0.140 / c-site 0.144 / b-site 0.155 — a three-way tie, all far
    # NAME WINS — nearest box is close but the margin is not decisive:
    ("c mound", "c-main"),    # b-main 0.057 / c-main 0.077 — only 1.35x, so the C in the name holds
    # GEOMETRY WINS — connectors, nearest is close and decisively so:
    ("c link", "mid"),        # mid 0.069 / b-site 0.078 / c-main 0.126 — the C options are ~2x out
    # A Link is the one entry that overrides even the nearest box: b-site is nearest at 0.032, but
    # Lotus's mid box x[0.42,0.54] y[0.38,0.49] sits almost entirely INSIDE the b-site box
    # x[0.43,0.57] y[0.39,0.53] (which is why Riot's own "B Site" point resolves as IN BOTH), so the
    # 0.032-vs-0.070 gap between them is measuring box slop, not real separation. Between two boxes
    # that overlap that heavily, a connector corridor belongs in `mid` rather than inside a SITE.
    ("a link", "mid"),
    # --- entries the geometry settles cleanly --------------------------------------------------
    ("a main", "a-main"),                                            # INSIDE
    ("a root", "a-main"), ("a rubble", "a-main"), ("a door", "a-main"),   # d=0.011 / 0.009 / 0.020
    ("a site", "a-site"), ("a hut", "a-site"),                       # INSIDE
    ("a top", "a-site"), ("a tree", "a-site"), ("a stairs", "a-site"), ("a drop", "a-site"),
    ("b main", "b-main"),                                            # INSIDE
    ("b pillars", "b-main"),                                         # d=0.039
    ("b site", "b-site"),      # IN b-site+mid; the name breaks the overlap
    ("b upper", "b-site"),                                           # d=0.024
    ("c site", "c-site"),                                            # INSIDE
    ("c bend", "c-site"), ("c hall", "c-site"),                      # d=0.005 / 0.018
    ("c main", "c-main"),                                            # INSIDE
    ("c door", "c-main"), ("c waterfall", "c-main"),                 # d=0.046 / 0.054
    # --- community terms the Lotus sources actually use ----------------------------------------
    ("site a", "a-site"), ("site b", "b-site"), ("site c", "c-site"),
    ("a default", "a-site"), ("b default", "b-site"), ("c default", "c-site"),
    ("a retake", "a-site"), ("b retake", "b-site"), ("c retake", "c-site"),
    ("a support", "a-site"), ("b support", "b-site"), ("c support", "c-site"),
    ("a early info", "a-site"), ("b early info", "b-site"), ("c early info", "c-site"),
    ("a info", "a-site"), ("b info", "b-site"), ("c info", "c-site"),
    ("a push", "a-site"), ("b push", "b-site"), ("c push", "c-site"),
    ("a anti plant", "a-site"), ("b anti plant", "b-site"), ("c anti plant", "c-site"),
    ("a antiplant", "a-site"), ("b antiplant", "b-site"), ("c antiplant", "c-site"),
    ("a open", "a-site"), ("b open", "b-site"), ("c open", "c-site"),
    ("a backsite", "a-site"), ("b backsite", "b-site"), ("c backsite", "c-site"),
    ("a reveal", "a-site"), ("b reveal", "b-site"), ("c reveal", "c-site"),
    ("a god", "a-site"), ("b god", "b-site"), ("c god", "c-site"),
    ("top mid", "mid"), ("bottom mid", "mid"),
    # Named plant spots that are not Riot callouts. B Pit is used by THREE independent creators
    # (TylerJedi/Ryvlex/HEHE XD, 7 titles, always "B Pit from <B Pillars|C Gravel|Defender Spawn>")
    # so it is a target on the B site itself, not the b-main approach it is thrown from. C Pillar is
    # confirmed on-site by hoverboarD spelling it out as "C Site Pillar".
    ("b pit", "b-site"), ("c pillar", "c-site"), ("c safe", "c-site"), ("c alternative", "c-site"),
    # "C Long" is not a Riot Lotus callout. Read as the long attacker-side approach — i.e. C Main —
    # because the one title using it is a Fade early-info reveal, which scans the approach rather
    # than the site. This is the weakest entry in the table; it decides exactly one row.
    ("c long", "c-main"),
    # Quible writes the site as a BARE letter when the lineup has no sub-callout ("C - Attacker
    # Molly"), so the reversed-grammar split is refused and the whole string must resolve. These are
    # site-QUALIFIED, unlike the bare `defender` entry the Haven table deliberately omits: the
    # letter is required, so they cannot hijack "A Site - Defender Molly".
    ("a attacker", "a-site"), ("b attacker", "b-site"), ("c attacker", "c-site"),
    ("a defender", "a-site"), ("b defender", "b-site"), ("c defender", "c-site"),
    # Stand-side terms. "defender side" sits BELOW "defender side spawn" (index 1) so the longer
    # Riot string still wins. A Heaven is the elevated deck over A; A Barrier is the rotating door.
    ("a heaven", "a-site"), ("a barrier", "a-main"), ("defender side", "ct-spawn"),
    # --- bare landmarks, strictly last ---------------------------------------------------------
    # Every one of these is unambiguous on Lotus (no A/B/C-qualified twin), so a bare mention can
    # only mean the one place. They sit below the qualified entries per the symmetry invariant.
    ("rubble", "a-main"), ("root", "a-main"),
    ("hut", "a-site"), ("drop", "a-site"), ("tree", "a-site"),
    ("pillars", "b-main"), ("upper", "b-site"),
    ("waterfall", "c-main"), ("mound", "c-main"),
    ("gravel", "c-site"), ("bend", "c-site"), ("hall", "c-site"),
    ("link", "mid"),          # both A Link and C Link resolve to mid, so bare is unambiguous
    ("middle", "mid"), ("mid", "mid"),
    ("ct", "ct-spawn"),
]
