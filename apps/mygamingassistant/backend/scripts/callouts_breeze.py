"""Breeze callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Breeze: a-site b-site a-main b-main mid t-spawn ct-spawn (same 7 as Summit).
#
# Built 2026-07-29 by the Sunset recipe: `callout_zones.py breeze` for Riot's own coordinates,
# `plot_callouts.py breeze` to LOOK at the result, then the three real sources' chapter titles for
# the community vocabulary. The overlay confirms the transform lands on the playable geometry, so a
# large nearest-box distance here means a genuine outlier, not a shifted cloud.
#
# `derive_callouts.py` is NOT the source for this map: all 74 shipped Breeze lineups are
# Sova/KAY/O/Viper with UTILITY-centric names ("Shock A", "Suppress Mid"), so the corpus does not
# determine a position table (18 unambiguous phrases vs 16+ ambiguous, with "site" n=40 splitting
# four ways).
BREEZE_CALLOUTS = [
    # Riot's verbatim spawn strings first (read_cards.py pulls the location readout as-is).
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # --- entries where the raw geometry is a KNOWN-BAD signal --------------------------------
    # "Defender Side Arches" nearest box is b-site at d=0.271 — far from everything, i.e. the
    # geometry decides nothing. Riot's own "Defender Side" prefix does: same family as the spawn
    # strings above.
    ("defender side arches", "ct-spawn"),
    # Mid family. "Mid Bottom" ranks t-spawn 0.101 and "Mid Nest" ranks ct-spawn 0.178, but every
    # other Mid-family callout on this map resolves to mid (Mid Pillar inside, Mid Hall 0.084,
    # Mid Wood Doors 0.089, Mid Top 0.099, Mid Cannon 0.111), and the project already maps
    # "mid bottom"/"bottom mid" -> mid on BOTH shipped maps. A lone Mid Bottom -> t-spawn would
    # split the family incoherently — the same argument that settled Sunset's "Mid Top".
    ("mid bottom", "mid"), ("bottom mid", "mid"), ("mid nest", "mid"),
    # "A Lobby" is the one true OUTLIER: (0.703,0.921) plots OFF the drawn radar entirely, so its
    # d=0.183 to a-main is measuring nothing. Settled by the project convention that is consistent
    # on both shipped maps — a lobby is the approach to its site.
    ("a lobby", "a-main"), ("b lobby", "b-main"),
    # --- entries the geometry settles cleanly ------------------------------------------------
    ("a bridge", "ct-spawn"),        # INSIDE ct-spawn
    ("a pyramids", "a-site"), ("a pyramid", "a-site"),   # INSIDE a-site
    ("a shop", "a-main"),            # INSIDE a-main
    ("a ramp", "ct-spawn"),          # d=0.062
    ("b back", "b-site"),            # d=0.007
    ("b window", "b-main"),          # d=0.037
    ("b elbow", "b-main"),           # d=0.058
    ("mid hall", "mid"),             # d=0.084
    ("mid wood doors", "mid"),       # d=0.089
    ("mid top", "mid"), ("top mid", "mid"),             # d=0.099
    ("mid cannon", "mid"),           # d=0.111
    ("mid pillar", "mid"),           # INSIDE mid
    ("b wall", "b-site"),            # d=0.139, and it is the wall ON B
    # "B Tunnel" nearest is mid at d=0.144 — not close. Placed by the same approach rule as the
    # lobbies: a named B-side corridor is the approach to B.
    ("b tunnel", "b-main"),
    # --- community terms the three Breeze sources actually use --------------------------------
    # HEHE XD writes "<TARGET> from <STAND>"; AiltonVG writes "Site A ..." with the words REVERSED;
    # nic.vallabh writes "<STAND> to <TARGET>" (see target_text's reversed-grammar note).
    # "site a"/"site b" MUST be present as their own entries — "a site" does not match "Site A".
    ("site a", "a-site"), ("site b", "b-site"),
    ("a default", "a-site"), ("b default", "b-site"),   # plant spots, per the Ascent family rule
    ("a center", "a-site"),
    ("a back site", "a-site"), ("a backsite", "a-site"),
    ("b back site", "b-site"), ("b backsite", "b-site"),
    ("a orange", "a-site"), ("b brown box", "b-site"), ("a brown box", "a-site"),
    ("mid entrance", "mid"),
    # STAND-side terms from nic.vallabh's reversed titles. These are needed even though they never
    # name a target: the reversed-grammar split is only accepted when BOTH sides resolve, so an
    # unknown stand silently blocks the row's TARGET too. `check_table_coverage.py` surfaced exactly
    # three such rows ("A Cubby to ...", "B Half Wall to B Entrance Cubby").
    # Riot carries none of these (callout_zones.py reports them ABSENT), so they are placed by the
    # documented family rule — approach terms (entrance) to <site>-main, on-site spots to <site>-site
    # — the same rule used for the Ascent and Sunset community vocabularies. Both A and B forms are
    # added together per the bare-entry symmetry invariant, even where only one side is attested.
    ("a entrance", "a-main"), ("b entrance", "b-main"),
    ("a cubby", "a-site"), ("b cubby", "b-site"),
    ("a half wall", "a-site"), ("b half wall", "b-site"),
    # BARE LANDMARKS — last-resort fallbacks, and safe ONLY while every A/B-qualified form they
    # could swallow sits ABOVE them. nic.vallabh's titles carry both "The Pillar Play" (Mid Pillar)
    # and "B Back Pillar"/"B Back Black Pillar", so the B-qualified forms are listed FIRST and a
    # bare "pillar" -> mid cannot swallow them. This is the `a boxes`/`b boxes` invariant: when
    # adding a bare callout, add BOTH qualified forms or neither.
    ("b back pillar", "b-site"), ("b black pillar", "b-site"), ("b pillar", "b-site"),
    ("a pillar", "a-site"),
    ("pillar", "mid"),
    # Bare "pyramid" is safe: A Pyramids is a Riot callout INSIDE a-site and Breeze has no B-side
    # pyramid, so there is no qualified form for it to swallow. Needed because the titles write
    # "A 2nd Pyramid back" / "A 1st Pyramid back", where the ordinal splits "a" from "pyramid" and
    # the qualified "a pyramid" entry can never match.
    ("pyramid", "a-site"),
    ("a main", "a-main"), ("b main", "b-main"), ("a site", "a-site"), ("b site", "b-site"),
    ("middle", "mid"), ("mid", "mid"), ("ct", "ct-spawn"),
]
