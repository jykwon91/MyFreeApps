"""Abyss callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.

Zones seeded for Abyss: a-site b-site a-main b-main A-LOBBY B-LOBBY mid t-spawn ct-spawn.
The lobbies are their OWN zones here — unlike Summit and Breeze, where "A Lobby" folds
into a-main because those maps seed no lobby zone.

Built 2026-08-22, the act Abyss rotated back into the pool (V26 Act 5, Breeze out):
`callout_zones.py abyss` for Riot's own coordinates run through the radar transform, then
`plot_callouts.py abyss` to LOOK at the projected cloud over the seeded boxes (it lands on
the drawn geometry with no shift or mirror, so a large nearest-box distance below is a
genuine outlier rather than a systematic offset), then maxWELL Lineup-Larry's 30-chapter
Abyss Sova source (cTrav7nTu2Y) for the community vocabulary the geometry never names.

`derive_callouts.py` is NOT a source for this map: Abyss has zero shipped lineups, so
there is no corpus to derive a position table from. Every entry below is either Riot's own
coordinate or an explicitly-argued judgement.
"""

ABYSS_CALLOUTS = [
    # Riot's verbatim spawn strings first (read_cards.py pulls the location readout as-is,
    # and VALORANT writes "Defender Side Spawn", which "defender spawn" cannot match on a
    # word boundary).
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # --- the lobbies, ahead of everything that could swallow them --------------------------
    # Abyss seeds a-lobby / b-lobby as real zones and Riot's A Lobby (0.775,0.237) and
    # B Lobby (0.826,0.796) land INSIDE them, so the Summit/Breeze "a lobby -> a-main"
    # convention does NOT apply here — folding them in would throw away a seeded zone.
    ("a lobby", "a-lobby"), ("b lobby", "b-lobby"),
    # --- entries the geometry settles cleanly ----------------------------------------------
    ("a bridge", "a-site"),          # INSIDE a-site (0.470,0.038)
    ("b nest", "b-main"),            # INSIDE b-main (0.674,0.903)
    ("b tower", "b-site"),           # d=0.044
    ("b danger", "b-main"),          # d=0.054, and Riot files it under B
    ("a tower", "a-site"),           # d=0.060
    ("a link", "a-site"),            # d=0.098 (mid is 0.258 away — NOT the Summit link rule)
    ("a security", "a-site"),        # d=0.101
    ("mid catwalk", "mid"),          # d=0.011
    ("mid library", "mid"),          # d=0.026
    ("mid bend", "mid"),             # d=0.036
    ("mid bottom", "mid"), ("bottom mid", "mid"),   # INSIDE mid
    # --- entries where the geometry is a TIE and something else decides ---------------------
    # "Mid Top" ranks ct-spawn 0.1700 and mid 0.1712 — a 0.001 gap decides nothing. Every
    # other Mid-family callout on this map is mid, and the project already maps
    # "mid top"/"top mid" -> mid on Summit, Sunset and Breeze. A lone Mid Top -> ct-spawn
    # would split the family incoherently.
    ("mid top", "mid"), ("top mid", "mid"),
    # "A Secret" ranks ct-spawn 0.1710 and a-site 0.1719 — the same non-decision. Riot's own
    # superRegionName for it is "A", and it is the defender-side flank INTO A, so it goes
    # with its family rather than with the spawn it happens to sit a millimetre nearer.
    ("a secret", "a-site"),
    # "B Link" ranks b-site 0.171 and mid 0.178 — again a tie. Two things break it the same
    # way: Summit already maps both "a link" and "b link" -> mid, and b-site here would make
    # this source's "B Link to B Default" a b-site -> b-site pair, i.e. a lineup whose stand
    # and target zones are identical and whose pins would sit on top of each other. mid keeps
    # the information. (Abyss's "A Link" is NOT a tie — see above — so the two do differ.)
    ("b link", "mid"),
    # "A Vent" ranks mid 0.100 over a-main 0.149 even though Riot files it under A: the vent
    # is the mid->A connector and is entered from mid, so the geometry and the way the map
    # plays agree against the filing.
    ("a vent", "mid"),
    # --- community terms the Abyss source actually uses -------------------------------------
    # Plant spots, per the family rule already applied on Ascent, Summit and Sunset.
    ("a default", "a-site"), ("b default", "b-site"),
    ("a backsite", "a-site"), ("b backsite", "b-site"),
    ("a back site", "a-site"), ("b back site", "b-site"),
    # "B Heaven" is not a Riot callout; it is the community name for the elevated position
    # over B, which Riot calls B Tower (d=0.044 to b-site). Summit's table already resolves
    # a bare "heaven" to b-site for the same reason.
    ("b heaven", "b-site"),
    # "B Window" and "B Rope" appear only INSIDE compound targets on this source ("B to B Main
    # & Window", "B Heaven to B Main & Rope"), i.e. they name features of B Main rather than a
    # separate area. Riot names neither.
    ("b window", "b-main"), ("b rope", "b-main"),
    ("a main", "a-main"), ("b main", "b-main"),
    ("a site", "a-site"), ("b site", "b-site"),
    # --- bare landmarks, strictly last ------------------------------------------------------
    # Only the ones with NO A/B twin. `tower`, `link`, `default` and `backsite` are
    # DELIBERATELY absent: Abyss carries both an A and a B version of each and they resolve to
    # different zones, so a bare form would be a coin flip dressed up as an answer.
    ("catwalk", "mid"), ("library", "mid"), ("bend", "mid"),
    ("middle", "mid"), ("mid", "mid"),
    ("bridge", "a-site"), ("nest", "b-main"), ("heaven", "b-site"),
    ("secret", "a-site"), ("security", "a-site"), ("vent", "mid"), ("danger", "b-main"),
    ("ct", "ct-spawn"),
    # This source writes the DESTINATION as a bare letter ("A Lobby to A", "B Main to B"), so
    # the single-letter forms have to resolve. They are the very last entries, so anything
    # more specific has already won by the time the scan reaches them.
    ("a", "a-site"), ("b", "b-site"),
]
