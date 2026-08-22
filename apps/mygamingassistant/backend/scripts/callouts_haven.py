"""Haven callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Haven: a-site b-site C-SITE a-lobby C-LOBBY GARAGE t-spawn ct-spawn.
#
# Haven is the odd map: THREE sites, and NO `mid`, `a-main` or `b-main` zone at all. Do not reach
# for those slugs here — the fail-loud contract will not catch a slug that simply never matches, it
# just silently ships an unpinned row. Built 2026-07-29 by the same recipe as Breeze
# (`callout_zones.py haven` + `plot_callouts.py haven`); the overlay lands cleanly on all 21
# callouts with NO outlier, so the geometry is trustworthy on this map.
HAVEN_CALLOUTS = [
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # --- the CONNECTOR rule -------------------------------------------------------------------
    # "A Sewer" (nearest b-site d=0.055) and "C Link" (nearest b-site d=0.078) are named for the
    # site they LEAD TO but physically sit beside B — the overlay shows both hard against the B
    # room. A zone decides WHERE THE PIN GOES, so the physical location wins over the name's site
    # affiliation. This is the one place Haven's naming and its geometry genuinely disagree.
    ("a sewer", "b-site"), ("c link", "b-site"), ("sewer", "b-site"),
    # "A Link" is the mirror case and does NOT conflict: d=0.094 to a-site, nothing nearer.
    ("a link", "a-site"),
    # --- the Mid family, which has no `mid` zone to go to -------------------------------------
    # Mid Courtyard (a-lobby 0.066) and Mid Window (a-lobby 0.056) sit in the central corridor
    # beside A Lobby; Mid Doors (c-lobby 0.080) sits lower, toward C. Bare "mid"/"middle" follows
    # Mid Courtyard — it is the map's actual centre and the majority of the family.
    ("mid courtyard", "a-lobby"), ("mid window", "a-lobby"), ("mid doors", "c-lobby"),
    # Bare "mid"/"middle" are last-resort fallbacks and live at the TAIL, below every qualified
    # site callout — per the bare-entry symmetry invariant. Up here they would swallow any title
    # that merely mentions the centre ("A Site Mid") and hand back a lobby.
    # --- entries the geometry settles cleanly -------------------------------------------------
    ("a lobby", "a-lobby"),          # INSIDE
    ("a garden", "a-lobby"),         # d=0.063
    # Bare "garden" is safe HERE, unlike the bare forms deliberately withheld on Split: Haven has
    # exactly ONE garden, so there is no A/B twin for it to coin-flip between. VALORANT's own
    # location readout prints the bare form (Tseeky's Fade source, cs=7), which is what needs to
    # resolve. Sits AFTER "a garden" so the qualified form still wins the scan. Ascent carries the
    # same bare entry for the same reason.
    ("garden", "a-lobby"),
    ("a tower", "a-site"),           # d=0.024
    ("a long", "a-site"),            # d=0.104 — the long approach INTO A; nothing else is near
    ("a site", "a-site"),            # INSIDE
    ("b back", "b-site"),            # d=0.037
    ("b site", "b-site"),            # INSIDE
    ("c garage", "garage"), ("garage", "garage"),        # INSIDE
    ("c window", "garage"),          # d=0.034 — adjacent to the garage mouth
    ("c cubby", "c-lobby"),          # d=0.008
    ("c long", "c-lobby"),           # d=0.073
    ("c lobby", "c-lobby"),          # INSIDE
    ("c site", "c-site"),            # INSIDE
    # --- community terms the three Haven sources actually use ---------------------------------
    # Quible writes "<STAND> - <TARGET>" (dash), Tseeky writes bare role phrases. Role terms name
    # the site they SERVE, per the Ascent/Sunset family rule.
    ("site a", "a-site"), ("site b", "b-site"), ("site c", "c-site"),
    ("a retake", "a-site"), ("b retake", "b-site"), ("c retake", "c-site"),
    ("a support", "a-site"), ("b support", "b-site"), ("c support", "c-site"),
    ("a early info", "a-site"), ("b early info", "b-site"), ("c early info", "c-site"),
    ("a info", "a-site"), ("b info", "b-site"), ("c info", "c-site"),
    ("a push", "a-site"), ("b push", "b-site"), ("c push", "c-site"),
    ("a default", "a-site"), ("b default", "b-site"), ("c default", "c-site"),
    ("a short", "a-site"),
    # NO "a wine" ENTRY, DELIBERATELY. It was added because Quible's U0IlINyWPdE chapter 1 is
    # titled "A Wine - A Site" — but that video's titles are wrong end to end (its footage is
    # C-side/mid/A-side while the titles read A/B), and "A Wine" is an ASCENT callout that does
    # not exist anywhere on Haven. Mapping it silently gave a bogus title a plausible-looking
    # zone. Leaving it unmapped makes the same mistake surface as an UNRESOLVED row instead.
    # Quible writes "B Main", which is NOT a Riot Haven callout and has no b-main zone to go to;
    # on this map the approach to B is the sewer/link/garage network, so it resolves to the site.
    ("a main", "a-site"), ("b main", "b-site"), ("c main", "c-site"),
    # --- bare fallbacks, strictly last ---------------------------------------------------------
    # "middle" must precede "mid": the lookup searches for the entry INSIDE the subject, so a bare
    # "mid" above it would match the string "middle" and make the longer entry unreachable.
    ("middle", "a-lobby"), ("mid", "a-lobby"),
    ("ct", "ct-spawn"),
]
