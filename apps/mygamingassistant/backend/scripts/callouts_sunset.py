"""Sunset callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Sunset: a-site b-site a-main b-main mid MARKET t-spawn ct-spawn.
#
# Sunset is the FIRST map built with ZERO shipped lineups, so `derive_callouts.py sunset` — which
# recovers a map's conventions from lineups already on it — has nothing to read and cannot be used.
# The table is therefore derived from Riot's own 17 Sunset callouts pushed through the PR #696
# transform onto the seeded zone boxes (`callout_zones.py sunset`), with `zone_rank.py` consulted
# wherever the nearest box won by a small margin. Where geometry and the project's existing
# convention disagree, the reason is written down at the entry rather than left implicit.
SUNSET_CALLOUTS = [
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # --- entries where the raw geometry is a KNOWN-BAD signal -------------------------------
    # Riot's "B Site" anchor is (0.044,0.562), whose nearest box is b-main (d=0.021) with b-site
    # only second (d=0.077). That is the same anchor the seeding pass already caught and hand-placed
    # in OVERRIDE: it sits at the B room's west DOORWAY, not on the tan spike-plant square. So the
    # geometry here is measuring the doorway, and a callout literally named "B Site" maps to b-site.
    ("b site", "b-site"),
    # "Mid Top" ranks ct-spawn 0.071 / mid 0.114 — a 0.043 gap, not decisive, and the anchor is
    # again a room entrance. Three independent reasons to call it mid: the project already maps
    # "top mid"/"mid top" -> mid on BOTH shipped maps (Summit and Ascent), every other Mid-family
    # callout here resolves to mid (Mid Bottom 0.012, Mid Courtyard inside, Mid Tiles 0.042), and a
    # lone Mid Top -> ct-spawn would split the family incoherently.
    ("mid top", "mid"), ("top mid", "mid"),
    # "B Lobby" is geometrically undecidable: t-spawn 0.129 / mid 0.139 / b-main 0.147, all far and
    # all within 0.018 of each other. Settled by project convention instead, which is consistent on
    # both shipped maps: a lobby is the approach to its site, so B Lobby -> b-main (and A Lobby ->
    # a-main, which here ALSO matches the geometry at d=0.049).
    ("b lobby", "b-main"), ("a lobby", "a-main"),
    # --- entries the geometry settles cleanly ----------------------------------------------
    # A Elbow d=0.003, A Link d=0.019 — both effectively touching the a-site box. NOTE this is the
    # OPPOSITE of Summit, where "A Link" -> mid; per-map tables exist precisely so a name can sit
    # somewhere different on a different map, and 0.019 from a-site is not a judgement call.
    ("a elbow", "a-site"), ("a link", "a-site"),
    # A Alley: a-site 0.113 vs a-main 0.242, a 2.1x gap. Consistent with Brimstone's
    # "A Anti Plant 2 From Alley", an anti-plant onto A site.
    ("a alley", "a-site"),   # bare "alley" is a fallback — see the BARE LANDMARK block at the end
    ("b boba", "b-site"),                              # Riot carries B Boba; lands INSIDE b-site
    ("b market", "market"), ("market stairs", "market"),
    ("mid bottom", "mid"), ("bottom mid", "mid"), ("mid courtyard", "mid"),
    ("mid tiles", "mid"),
    ("a main", "a-main"), ("b main", "b-main"), ("a site", "a-site"),
    # --- community terms Riot does not carry, placed by the same family rules as Ascent ------
    # "<SITE> <spot> N" plants on that site; antiplant/retake/support/execute/info name the site
    # they serve. These are the vocabularies Tseeky's three Sunset sources actually use.
    ("a default", "a-site"), ("b default", "b-site"),
    ("a anti plant", "a-site"), ("b anti plant", "b-site"),
    ("a antiplant", "a-site"), ("b antiplant", "b-site"),
    ("a box corner", "a-site"), ("a close", "a-site"),
    # "a boxes" exists only because the BARE "boxes" entry further down maps to b-site, so without
    # an A-side form ahead of it Snapiex's "A Boxes [Snake Bite]" resolved to B SITE — an A-site
    # molly pinned on the wrong half of the map. The bare entries at the end of this table are
    # deliberately loose and are safe only while every A/B-qualified form they could swallow sits
    # ABOVE them; "b boxes" was here and "a boxes" was not, and that asymmetry was the whole bug.
    # When adding a bare callout, add BOTH qualified forms or neither.
    ("b best plant", "b-site"), ("a boxes", "a-site"), ("b boxes", "b-site"), ("b stairs", "b-site"),
    ("a execute", "a-site"), ("b execute", "b-site"),
    ("a retake", "a-site"), ("b retake", "b-site"),
    ("a support", "a-site"), ("b support", "b-site"),
    ("a info", "a-site"), ("b info", "b-site"),
    # Cypher-trip darts (Tseeky's Sova source, 6 chapters). Same role-phrase rule: a dart that
    # breaks a trip guarding a site is named for, and aimed at, that site. "Trips On B" is the
    # attacker phrasing of the same thing.
    ("cypher a trip", "a-site"), ("cypher b trip", "b-site"),
    ("cypher trips on a", "a-site"), ("cypher trips on b", "b-site"),
    # nic.vallabh writes the side into the plant name rather than as a prefix. Still "<SITE> <spot>"
    # — the plant is on A either way; only the side differs, and side is a separate field.
    ("a attack plant", "a-site"), ("a defense plant", "a-site"),
    ("b attack plant", "b-site"), ("b defense plant", "b-site"),
    ("a corner", "a-site"), ("b corner", "b-site"),
    # Tseeky's Sunset Fade source names two-place recon darts with a slash. The LEADING place is
    # the target — the same rule the Ascent table already follows for "DEF B Lobby/Mid Link"
    # (-> b-main) — so these resolve to their site, not to mid. They need explicit entries because
    # the leading token is a bare letter: "a info" does not literally occur in "A/Mid Info", so
    # without them the bare "mid" fallback would claim both.
    # WRITTEN WITHOUT THE SLASH ON PURPOSE: callout_to_zone replaces every non-alphanumeric with a
    # space BEFORE matching, so "A/Mid Info" is looked up as "a mid info". An entry spelled
    # "a/mid info" matches nothing and fails silently — it looks present in the table and never
    # fires. No entry in this table may contain punctuation.
    ("a mid info", "a-site"), ("b mid info", "b-site"),
    # --- BARE LANDMARK FALLBACKS — must stay LAST ------------------------------------------
    # callout_to_zone returns the FIRST table entry found ANYWHERE in the text, so a bare landmark
    # sitting above a qualified term hijacks it: "market" at the top resolved "B Default 2 Market
    # Side" to `market` instead of b-site, because `b default` never got a chance to match. Every
    # single-word landmark here is a fallback for when NOTHING more specific matched, and ordering
    # is the only thing that expresses that. Add new bare terms to this block, never above it.
    ("middle", "mid"), ("mid", "mid"), ("tiles", "mid"), ("courtyard", "mid"),
    ("market", "market"), ("boba", "b-site"), ("alley", "a-site"),
    ("elbow", "a-site"), ("boxes", "b-site"), ("stairs", "b-site"), ("link", "a-site"),
    ("ct", "ct-spawn"),
]
