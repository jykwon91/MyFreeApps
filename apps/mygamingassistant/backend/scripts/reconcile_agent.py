"""Generic localize->spans reconciler for the MGA Summit fan-out.

  python reconcile_agent.py <agent> <task-output-path> [--apply] [--apply-ability] [--apply-stand]

Merges gate-passed spans + technique into scripts/<agent>-spans/summit.json.
By default NEVER touches side / ability / target / stand â€” those come from the video
author's chapter labels, which beat the localizer's in-frame inference (a practice-server
demo player reads as "attacker" even in a defense lineup; see the KAY/O #16
zero-point/fragment case). Non-gate-passed lineups are DROPPED from the ship set;
back up the full skeleton first if you plan to retry them.

--apply-ability: for sources where the author does NOT label the ability (Fade/Tseeky â€”
titles say "ATT A Site Best" with no haunt-vs-seize hint). There the localizer's call is
the ONLY signal, so it wins. Only values in the agent's seeded ability set are accepted;
anything else keeps the provisional value and is reported as UNRESOLVED.

--apply-stand: same principle for the STAND zone. Where the title says "From X" the author
gave the stand and it wins; where it doesn't, the skeleton carries a coarse guess that often
collapses to stand == target (a "retake" thrown from the site into the site). For those rows
ONLY, map the localizer's observed `stand_loc` callout onto a map zone. Unmappable callouts
keep the guess and are reported as UNRESOLVED.

--merge: REQUIRED for a RETRY pass. A retry result only covers the handful of rows that failed
the first pass, and the default --apply rewrites the pack to exactly the rows present in THIS
result — which would silently delete every row the first pass already localized. With --merge,
rows absent from this result are left untouched, rows that passed are updated, and only rows
that were in THIS run's item set AND failed again are dropped. Refuses to run without --apply.
"""
import json, re, sys
from collections import Counter
from pathlib import Path

BE = Path(__file__).resolve().parents[1]  # scripts/ -> backend/

# --- BEGIN CLI (excised by test_callouts.py â€” keep the sentinels) ---
if len(sys.argv) < 3:
    raise SystemExit(__doc__)
AGENT, OUTFILE = sys.argv[1], Path(sys.argv[2])
APPLY = "--apply" in sys.argv
APPLY_ABILITY = "--apply-ability" in sys.argv
APPLY_STAND = "--apply-stand" in sys.argv
MERGE = "--merge" in sys.argv
if MERGE and not APPLY:
    raise SystemExit("ABORT â€” --merge only means anything alongside --apply")

# --pack <stem> selects a NON-DEFAULT spans file for agents ingested from more than one source
# (see ingest_agent.py's MULTI-SOURCE note: video_id is per-pack, so each source keeps its own
# file). Default stem stays "summit" so every single-source agent is unaffected.
PACK = "summit"
if "--pack" in sys.argv:
    i = sys.argv.index("--pack")
    if i + 1 >= len(sys.argv):
        raise SystemExit("ABORT â€” --pack needs a value")
    PACK = sys.argv[i + 1]
SPANS = BE / "scripts" / f"{AGENT}-spans" / f"{PACK}.json"
if not SPANS.exists():
    raise SystemExit(f"ABORT â€” spans pack {SPANS} not found")
# --- END CLI ---

# Callout -> coarse map-zone slug, PER MAP. Longest match first, so "bottom mid" beats "mid"
# and "b gym" beats "b".
#
# Keyed on the pack's own map_slug and FAILS LOUD for a map with no table: falling back to
# Summit's would silently map (say) an Ascent "Market" callout onto a Summit zone that doesn't
# exist on Ascent, and the only symptom would be wrong pins at the operator's eyeball gate.
#
# Zones seeded for Summit: a-site b-site a-main b-main mid t-spawn ct-spawn.
SUMMIT_CALLOUTS = [
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"), ("ct spawn", "ct-spawn"),
    ("t spawn", "t-spawn"), ("b heaven", "b-site"), ("a heaven", "a-site"),
    ("mid fountain", "mid"), ("mid bottom", "mid"), ("bottom mid", "mid"),
    ("mid tiles", "mid"), ("mid bend", "mid"), ("mid top", "mid"), ("top mid", "mid"),
    ("a garden", "a-site"), ("a lobby", "a-main"), ("b lobby", "b-main"),
    ("a link", "mid"), ("b link", "mid"), ("a cave", "a-site"), ("a art", "a-site"),
    ("b drop", "b-site"), ("b hut", "b-site"), ("b gym", "ct-spawn"),
    # Community plant-spot names, same family rule as the Ascent and Sunset tables. Added late:
    # Summit's titles carry a "from <stand>" clause, so before target_text() stripped it these
    # resolved off the STAND ("A Default from A Lobby" -> a-main) and the gap never showed. The
    # zones here are not inferred — they are what the 16 already-accepted rows from 3GUKAYiurQk
    # actually store (a-site for A Default / A Open, b-site for B Default), read back out of the DB
    # by check_ingested_regression.py. Without these a Summit rebuild would silently drop all 16.
    ("a default", "a-site"), ("b default", "b-site"),
    ("a open", "a-site"), ("b open", "b-site"),
    ("a main", "a-main"), ("b main", "b-main"), ("a site", "a-site"), ("b site", "b-site"),
    ("fountain", "mid"), ("tiles", "mid"), ("middle", "mid"), ("garden", "a-site"),
    ("heaven", "b-site"), ("gym", "ct-spawn"), ("mid", "mid"), ("ct", "ct-spawn"),
]

# Zones seeded for Ascent: a-site b-site a-main b-main mid MARKET t-spawn ct-spawn.
# Market is its OWN zone here — it is not folded into mid or b-main as it would be on other maps.
# Entries below are backed by `derive_callouts.py ascent`, which reads the zone assignments of the
# 124 already-shipped Ascent lineups rather than trusting map knowledge I would otherwise be
# inventing. Where that derivation was an n-gram artifact (e.g. "mid cubby" appearing to target
# a-site because it came from a "A Site from Mid Cubby" title) the standard callout wins instead.
ASCENT_CALLOUTS = [
    # Riot's own strings first — read_cards.py pulls the location readout verbatim, and VALORANT
    # writes "Defender Side Spawn", which "defender spawn" does not match on a word boundary.
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # "B Spawn" was mapped to ct-spawn on the assumption it named the defenders' spawn. The
    # Tseeky Brimstone source has a "B SPAWN" molly thrown from B Main: its landing frame is an
    # alley of B, and the minimap marker sits hard against the B-site box — while the SAME
    # video's "B ANTIPLANT", whose in-game readout literally says "Defender Side Spawn", puts the
    # marker top-centre, nowhere near it. The callout names the back of B, not the spawn.
    ("b spawn", "b-site"),
    # Plant-spot and role names. Riot carries only 22 Ascent callouts (callout_zones.py) and none
    # of Default / Safe / Gen / Antiplant is among them — they are community terms, so they get a
    # zone from the family they belong to: "<SITE> <spot> N" is a plant on that site, and
    # antiplant denies a plant on that site (same rule as retake/support below).
    ("a default", "a-site"), ("b default", "b-site"), ("a safe", "a-site"),
    ("a antiplant", "a-site"), ("b antiplant", "b-site"), ("a gen", "a-site"),
    # Hyphenated spellings. callout_to_zone strips punctuation to spaces, so Bonsai's "A Anti-Plant"
    # normalizes to "a anti plant" and does NOT match the "a antiplant" entry above - it mapped to
    # no zone at all until these were added, on a source where anti-plant is also the side evidence.
    ("a anti plant", "a-site"), ("b anti plant", "b-site"),
    # A Garden IS a Riot Ascent callout (0.285,0.309), just not one any zone box contains. Nearest
    # box is a-site at d=0.097, ahead of ct-spawn at 0.128 (zone_rank.py). The four Bonsai chapters
    # that stand there all throw onto A site, which is consistent with it being A-side ground.
    ("a garden", "a-site"),
    # "A Orb" is the A-side Ultimate Orb, which Riot carries no callout for. Placed from footage,
    # not from memory: on cs=182 and cs=198 the hot-hands pool burns beside the visible teal orb in
    # a corridor whose in-game location readout says "A Main" - so a-main, NOT the a-site the
    # "A <spot>" family rule below would otherwise have given it.
    ("a orb", "a-main"),
    # Same treatment. On cs=415 the curveball is thrown from A Lobby and pops in the corridor read
    # as "A Main" (sweep_chapter.py 425.0s), so anti-peek denies the A Main peek.
    ("a anti peak", "a-main"),
    # No footage read for this one: on cs=120 the molly lands in the archway feeding B site and the
    # frames do not pin which side of it. Falls back to the role-phrase rule used for retake /
    # support / antiplant below - a lineup named for the site it serves targets that site.
    ("b anti rush", "b-site"),
    ("a heaven", "a-site"), ("a rafters", "a-site"), ("a generator", "a-site"),
    ("a dice", "a-site"), ("a wine", "a-site"), ("a hell", "a-site"), ("a green", "a-site"),
    ("a backsite", "a-site"), ("a back site", "a-site"), ("a back", "a-site"),
    ("a short", "a-site"), ("a site", "a-site"),
    # Role phrases, not places: a "Retake"/"Support" lineup is named for the site it serves, so it
    # targets that site. Semantic rather than derived (Ascent's existing Sova/KAY/O/Viper titles
    # don't use this vocabulary), but it matches how the Summit Fade set was mapped.
    ("a retake", "a-site"), ("b retake", "b-site"),
    ("a support", "a-site"), ("b support", "b-site"),
    ("a lobby", "a-main"), ("a tree", "a-main"), ("a door", "a-main"), ("a main", "a-main"),
    ("b stairs", "b-site"), ("b boat", "b-site"), ("b back", "b-site"),
    ("b corner", "b-site"), ("b front", "b-site"), ("b site", "b-site"),
    ("b lobby", "b-main"), ("b main", "b-main"),
    ("b market", "market"), ("mid market", "market"),
    ("mid link", "mid"), ("mid cubby", "mid"), ("mid top", "mid"), ("top mid", "mid"),
    ("mid bottom", "mid"), ("bottom mid", "mid"), ("mid courtyard", "mid"), ("mid catwalk", "mid"),
    ("market", "market"),
    ("heaven", "a-site"), ("rafters", "a-site"), ("generator", "a-site"), ("dice", "a-site"),
    ("wine", "a-site"), ("hell", "a-site"), ("boat", "b-site"), ("stairs", "b-site"),
    ("tree", "a-main"), ("catwalk", "mid"), ("pizza", "mid"), ("cubby", "mid"),
    ("courtyard", "mid"), ("link", "mid"), ("middle", "mid"), ("mid", "mid"),
    ("ct", "ct-spawn"),
]

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

# Zones seeded for Split: a-site b-site a-main b-main mid MAIL t-spawn ct-spawn. `mail` is Split's
# own extra zone, the same shape as Ascent's `market` — it must NOT collapse into mid.
#
# Unlike Lotus, applying the standard rule (geometry overrides the name only when the nearest box is
# CLOSE, d <= ~0.11, AND beats the name's family by ~2x) leaves Split with ZERO name/geometry
# conflicts — every callout resolves inside its own family. Two came close and both were settled by
# the margin half of the test rather than by hand:
#   B Tower  — mail 0.037 / b-main 0.053. Close, but only 1.4x, so the B in the name holds.
#   B Stairs — mail 0.112 / ct-spawn 0.127 / b-main 0.146. Nothing is close; the name holds.
SPLIT_CALLOUTS = [
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # `mid mail` MUST precede the bare `mid` entry at the tail, or Split's own mail zone becomes
    # unreachable through Riot's actual callout string and every mail lineup silently lands in mid.
    ("mid mail", "mail"), ("b mail", "mail"), ("mail", "mail"),
    # --- A side ---------------------------------------------------------------------------------
    ("a main", "a-main"),                                       # INSIDE
    ("a lobby", "a-main"),                                      # d=0.103, a-site is 0.265 away
    ("a ramps", "a-main"), ("a ramp", "a-main"),                # d=0.097
    ("a sewer", "a-main"),                                      # d=0.124 — far, but family agrees
    ("a site", "a-site"),                                       # INSIDE
    ("a back", "a-site"), ("a rafters", "a-site"),              # d=0.016 / 0.020
    ("a tower", "a-site"), ("a screens", "a-site"),             # d=0.082 / 0.095
    # --- B side ---------------------------------------------------------------------------------
    ("b site", "b-site"),                                       # INSIDE
    ("b back", "b-site"), ("b alley", "b-site"),                # d=0.021 / 0.072
    # "B Rafter Box" is a PLANT SPOT on the site and must be read before the bare-singular entry
    # below it, which would otherwise claim it for b-main. B Rafters the POSITION stays b-main:
    # nearest box 0.026 vs b-site 0.050, and hoverboarD uses it as an elevated STAND ("B Rafters to
    # B Lobby"), not as somewhere to land utility.
    ("b rafter box", "b-site"),
    ("b rafters", "b-main"), ("b rafter", "b-main"), ("b garage", "b-main"),   # d=0.026 / 0.043
    ("b tower", "b-main"), ("b stairs", "b-main"),              # see the header note
    ("b link", "b-main"), ("b lobby", "b-main"),                # nearest boxes 0.114 / 0.182 — far
    # Not a Riot Split callout — Riot names the B approach Garage/Alley/Lobby — but four creators
    # (Tseeky, hoverboarD, HEHE XD, Brim Sensei) write "B Main" anyway, and its absence blocked
    # every one of those rows.
    ("b main", "b-main"),
    # --- middle ---------------------------------------------------------------------------------
    ("mid bottom", "mid"), ("mid top", "mid"), ("mid vent", "mid"),
    ("bottom mid", "mid"), ("top mid", "mid"),
    # --- community terms ------------------------------------------------------------------------
    ("site a", "a-site"), ("site b", "b-site"),
    ("a default", "a-site"), ("b default", "b-site"),
    ("a retake", "a-site"), ("b retake", "b-site"),
    ("a support", "a-site"), ("b support", "b-site"),
    ("a early info", "a-site"), ("b early info", "b-site"),
    ("a info", "a-site"), ("b info", "b-site"),
    ("a push", "a-site"), ("b push", "b-site"),
    ("a open", "a-site"), ("b open", "b-site"),
    ("a backsite", "a-site"), ("b backsite", "b-site"),
    ("a reveal", "a-site"), ("b reveal", "b-site"),
    ("a god", "a-site"), ("b god", "b-site"),
    ("a anti plant", "a-site"), ("b anti plant", "b-site"),
    # The lookup anchors on \b at BOTH ends, so the singular entry does not match the plural form —
    # "b antiplants" fell through and blocked its row. Plurals need their own entry.
    ("a antiplant", "a-site"), ("b antiplant", "b-site"),
    ("a antiplants", "a-site"), ("b antiplants", "b-site"),
    ("a heaven", "a-site"), ("b heaven", "b-site"),
    # Named plant spots on the sites, from HEHE XD / Tseeky / Ryvlex / Brim Sensei. hoverboarD
    # spells the first one out as "A Site Elbow", which is what settles it as on-site.
    ("a elbow", "a-site"), ("a pocket", "a-site"), ("a safe", "a-site"), ("b safe", "b-site"),
    ("a corner", "a-site"), ("b corner", "b-site"),
    ("a screen", "a-site"), ("a rafter", "a-site"),
    ("a attacker", "a-site"), ("b attacker", "b-site"),
    ("a defender", "a-site"), ("b defender", "b-site"),
    ("defender side", "ct-spawn"),
    # --- bare landmarks, strictly last ----------------------------------------------------------
    # Only the ones with no A/B twin. `tower`, `rafters` and `back` are DELIBERATELY absent: Split
    # carries both an A and a B version of each, and they resolve to different zones (A Tower is
    # a-site while B Tower is b-main), so a bare form would be a coin flip dressed up as an answer.
    # Both spellings: "A Front Screen Plant" carries the singular, and the plural entry cannot match
    # it (\b at both ends). Only A has screens on Split, so bare is unambiguous — including Brim
    # Sensei's "CT Screens", which names the same area viewed from the defender side.
    ("screens", "a-site"), ("screen", "a-site"),
    ("ramps", "a-main"), ("sewer", "a-main"),
    ("alley", "b-site"), ("garage", "b-main"), ("link", "b-main"),
    ("vent", "mid"), ("middle", "mid"), ("mid", "mid"),
    ("ct", "ct-spawn"),
]

CALLOUTS_BY_MAP = {"summit": SUMMIT_CALLOUTS, "ascent": ASCENT_CALLOUTS,
                   "sunset": SUNSET_CALLOUTS, "breeze": BREEZE_CALLOUTS,
                   "haven": HAVEN_CALLOUTS, "lotus": LOTUS_CALLOUTS,
                   "split": SPLIT_CALLOUTS}


def leading_callout(text):
    """Localizers report stand_loc as '<callout> (<clarification>)'. Only the LEADING callout
    names the spot; the parenthetical usually names a NEIGHBOURING landmark and must not win.

    Real case: 'B Site (at the B Main doorway/mouth)' â€” the player stands at B SITE, near the
    B Main mouth. Matching the whole string hit 'b main' first (it precedes 'b site' in the
    longest-first table) and would have moved a correct b-site stand to b-main.

    Brackets get the same treatment as parens: Snapiex's Viper/Sunset source writes the ABILITY in
    brackets ('A Corner [Snake Bite]', 'B Main / Middle from B [Toxic Screen]'), which is not a
    callout at all and left those rows unmappable."""
    s = str(text or "")
    head = re.split(r"[(\[]", s, maxsplit=1)[0].strip()
    return head or s


def target_text(title, table=None):
    """The part of a chapter title that names the TARGET, with the stand clause removed.

    `callout_to_zone` returns the FIRST table entry it finds anywhere in the string, so any callout
    mentioned in a title competes to be the target — including the one after "from", which names
    where the player STANDS. Ascent never exposed this because its titles carry no "from"; every
    title in Tseeky's Sunset Brimstone source does, and "B Default 3 From Market" resolved to
    `market` instead of `b-site`. Ordering the table so every target term precedes every stand term
    would "fix" the two known cases by coincidence and silently break on the next source.

    Same shape as leading_callout()'s parenthetical strip, for the same reason: cut the clause that
    is known not to name this field, then match.

    THE REVERSED GRAMMAR. Some creators write `<STAND> to <TARGET>` — the opposite order — and such
    a title carries no "from", so the whole string used to be matched and the first table hit (the
    STAND) won. Every lineup from such a source would ship with stand and target SWAPPED, and the
    only symptom is wrong pins at the operator's eyeball gate. Found on nic.vallabh's breeze/Phoenix
    source (15 of 18 titles, e.g. 'A Lobby to A Shop'), which is the ONLY one of the 12 post-Sunset
    sources that writes this way — see `<scratch>/title_grammar.py`, and re-run it on any new source.

    Gated on EVIDENCE, not on the word alone: the split is accepted only when `table` is supplied
    and BOTH sides independently resolve to a zone. "to" is an ordinary English word, and a bare
    `\\bto\\b` split would happily mangle a title that merely contains it.

    Separators are `to`, arrows, AND the spaced dash — the same set build_phoenix.split_title uses.
    The dash was left out at first, on the worry that AiltonVG's 'Site A Attack - Lineup 1' would
    lose its 'Site A'. The evidence gate already prevents that ('Lineup 1' resolves to nothing, so
    the split is refused and the whole string is matched), and Quible's Haven sources write the
    reversed grammar with a dash rather than "to" ('A Wine - A Site'), so excluding it would have
    silently mis-targeted those. The dash must be WHITESPACE-DELIMITED so hyphenated callouts like
    'Anti-Plant' are untouched.

    THE LEADING TAG. The parenthetical strip assumes the bracket opens a TRAILING clarification, so
    it keeps everything BEFORE the first bracket. hoverboarD tags the ability at the FRONT instead
    ('[Def Eye] A Tree to A Main/Rubble'), and for those the text before the first bracket is the
    empty string — every one of that creator's rows resolved to no target at all. It showed up as 34
    of 64 unresolved titles on the Lotus coverage check, and hoverboarD is a source on four maps, so
    this was suppressing rows well beyond Lotus. Strip a LEADING tag first, and if the trailing strip
    somehow still empties the string, fall back to the raw title rather than returning ''.
    """
    s = re.sub(r"^\s*[\[(][^\])]*[\])]\s*", "", str(title or ""))
    s = re.split(r"[(\[]", s, maxsplit=1)[0]
    if not s.strip():
        s = str(title or "")
    if re.search(r"\bfrom\b", s, flags=re.I):
        return re.split(r"\bfrom\b", s, maxsplit=1, flags=re.I)[0].strip() or s.strip()
    if table:
        parts = re.split(r"\s+(?:to|[-–—>]|→)\s+", s, maxsplit=1, flags=re.I)
        if len(parts) == 2 and all(_first_table_hit(p, table) for p in parts):
            return parts[1].strip()
    return s.strip()


def _first_table_hit(text, table):
    t = re.sub(r"[^a-z0-9 ]+", " ", str(text or "").lower())
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return None
    for word, slug in table:
        if re.search(rf"\b{re.escape(word)}\b", t):
            return slug
    return None


def callout_to_zone(text, table):
    """Map a free-text callout onto a coarse zone slug for THIS map; None when unrecognizable.

    A SLASH joins two adjacent areas one throw covers, and the FIRST names the destination:
    "B Market/B Site God Arrow" lands in Market on the way through to B. A whole-string scan cannot
    express that, because the loop below returns the first entry found by TABLE ORDER, not by
    position in the text — `b site` sits above `b market` in the Sunset table, so that title
    silently resolved to b-site. Trying the first slash segment on its own is what makes
    "first one wins" a rule instead of an accident of how the table happens to be sorted. The two
    slash cases already pinned in test_callouts ("A Main/Site", "B Gym/CT") both passed only because
    the ordering happened to agree.

    The whole string is still tried when the first segment resolves to nothing, which is what keeps
    the OTHER slash idiom working: "A/Mid Info" is one compressed callout, its first segment is a
    bare "A" that matches nothing, and the table carries `a mid info` outright.

    The split is looked for only BEFORE any paren/bracket, so a slash inside a clarification cannot
    trigger it — "B Site (at the B Main doorway/mouth)" must keep resolving on the whole string, and
    splitting at that slash would hand the lookup "B Site (at the B Main doorway" and move a correct
    b-site stand to b-main. Callers strip parentheticals via leading_callout/target_text before
    calling here anyway; this is the belt to that suspenders.
    """
    head = re.split(r"[(\[]", str(text or ""), maxsplit=1)[0]
    if "/" in head:
        return _first_table_hit(head.split("/", 1)[0], table) or _first_table_hit(text, table)
    return _first_table_hit(text, table)


def stand_zone_from_loc(text):
    """Zone for a localizer stand_loc, judged on the leading callout only."""
    return callout_to_zone(leading_callout(text), CALLOUTS)

# Seeded ability slugs for this agent â€” the whitelist an --apply-ability call must match.
AGENT_ABILITIES = {
    "sova": {"recon", "shock"},
    "kay-o": {"flashdrive", "fragment", "zero-point"},
    "viper": {"snake-bite", "poison-cloud", "toxic-screen"},
    "brimstone": {"brim-incendiary", "sky-smoke"},
    "fade": {"haunt", "seize"},
    # Phoenix's sources do NOT label the ability in the chapter title, so --apply-ability is
    # REQUIRED here, not optional â€” the localizer's curveball-vs-hot-hands call is the only
    # signal. Without this entry the whitelist is empty and every call silently stays
    # UNRESOLVED, shipping whatever provisional label the skeleton guessed.
    "phoenix": {"curveball", "hot-hands"},
}
VALID_ABILITIES = AGENT_ABILITIES.get(AGENT, set())
if APPLY_ABILITY and not VALID_ABILITIES:
    raise SystemExit(f"ABORT â€” --apply-ability given but no whitelist for agent {AGENT!r}; "
                     f"add its seeded slugs to AGENT_ABILITIES first")

# Localizers frequently answer with the slug PLUS its justification, e.g.
#   "hot-hands (confirmed from landing signature - flat orange fire pool, no white flash burst)"
# A bare `a in VALID_ABILITIES` test misses those, and the miss is silent: the row keeps whatever
# provisional ability the skeleton guessed. Phoenix/Sunset hit this on 2 of 9 rows and was saved only
# by luck (the guess already said hot-hands). With a `curveball` guess it would have shipped the wrong
# ability behind one easily-missed console line.
#
# So read the LEADING token and require a delimiter after it, which keeps the prose case while
# refusing a genuinely undecided answer ("curveball or hot-hands"). Note the second Phoenix row said
# "...; NOT a curveball flash burst" - i.e. the prose legitimately NAMES the other ability to rule it
# out, so "exactly one whitelisted word appears anywhere" is the wrong rule. Position matters.
# Two patterns, not one: a trailing \b cannot match after "/" or "|" (there is no word boundary
# between two non-word chars), so folding the symbol separators into the word alternation silently
# lets "hot-hands / curveball" through as if it were a confident answer.
_HEDGE_SYM = re.compile(r"^\s*[/|]")
_HEDGE_WORD = re.compile(r"^\s*,?\s*(?:or|vs\b\.?|either|maybe|possibly|unsure|unclear|"
                         r"could\s+be|not\s+sure)\b", re.I)


def resolve_ability(raw):
    """Map a localizer ability answer onto one whitelisted slug.

    Returns (slug_or_None, note). slug None => caller must NOT write, and must say so loudly.
    """
    s = str(raw or "").strip().lower()
    if not s:
        return None, "empty"
    if s in VALID_ABILITIES:
        return s, ""
    m = re.match(r"[a-z][a-z-]*", s)
    if not m:
        return None, f"no leading slug token in {s[:60]!r}"
    tok, rest = m.group(0), s[m.end():]
    if tok not in VALID_ABILITIES:
        return None, f"leading token {tok!r} not in {sorted(VALID_ABILITIES)}"
    if rest and not re.match(r"[\s(:;,.\-–—]", rest):
        return None, f"leading token {tok!r} runs straight into {rest[:12]!r}"
    if _HEDGE_SYM.match(rest) or _HEDGE_WORD.match(rest):
        return None, f"undecided between alternatives: {s[:70]!r}"
    return tok, f"leading token of prose answer {s[:70]!r}"


def extract_json(text):
    k = text.rfind('"recutCount"')
    i = text.rfind("{", 0, k) if k >= 0 else text.find("{")
    if i < 0:
        return None
    depth = 0; instr = False; esc = False
    for j in range(i, len(text)):
        c = text[j]
        if instr:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': instr = False
        else:
            if c == '"': instr = True
            elif c == "{": depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[i:j + 1]
    return None


def spans_ok(loc):
    return bool(loc) and all(
        isinstance(loc.get(k), list) and len(loc[k]) == 2
        and isinstance(loc[k][0], (int, float)) and isinstance(loc[k][1], (int, float))
        and loc[k][1] > loc[k][0]
        for k in ("stand", "aim", "throw", "landing"))


# A LANDING may start slightly before the THROW *window* ends without being wrong: the throw span
# brackets the release ANIMATION, not the release instant, so a short-flight utility can genuinely
# deploy while that window is still running. Calibrated on all 619 localized rows in every pack
# (`audit_packs_ordering.py`): 18 rows overlap, and 16 of them do so by <0.5s — 15 of those 16 are
# `zero-point`, KAY/O's knife, whose flight really is that short. That is ONE systematic labelling
# boundary for one ability, not 16 independent errors, and an adversarial gate looked at the frames
# and passed them. Only the 2 rows beyond this threshold are genuinely broken (their LANDING sits
# 15.1s and 6.45s BEFORE the throw, with non-monotonic starts to match).
LANDING_OVERLAP_TOL = 0.5


def spans_ordered(loc):
    """The four events must OCCUR in order, and a deploy cannot meaningfully precede its release.

    spans_ok() validates each span IN ISOLATION (positive length), so nothing checked ordering
    ACROSS events — and the gate does not close the hole either: its PASS list checks span length
    and window membership and never mentions ordering. That let rows through whose LANDING window
    sits entirely before the THROW.

    Two rules, both arithmetic rather than judgement, so neither is left to a vision agent:
      * monotonic starts — that IS the event order; fires on 2 of 619 banked rows, both plainly
        broken.
      * landing_start > throw_end - LANDING_OVERLAP_TOL — see the note above for why the tolerance
        exists and is not merely permissive.

    Deliberately NOT enforced: an AIM/THROW overlap. The throw animation genuinely begins while the
    player is still settled on the alignment reference, so that boundary is a labelling choice
    rather than an error — it occurs on 31 of 41 rows of one run, 13 of them gate-passed.

    Returns (ok, reason).
    """
    s, a, t, l = (loc[k] for k in ("stand", "aim", "throw", "landing"))
    if not s[0] <= a[0] <= t[0] <= l[0]:
        return False, (f"events out of order (starts {s[0]}/{a[0]}/{t[0]}/{l[0]} for "
                       f"stand/aim/throw/landing)")
    over = t[1] - l[0]
    if over >= LANDING_OVERLAP_TOL:
        return False, (f"landing starts {round(over, 3)}s BEFORE throw ends (tolerance "
                       f"{LANDING_OVERLAP_TOL}s) - the deploy cannot precede its own release")
    return True, ""


def norm_tech(loc):
    t = (loc.get("technique") or "standing").strip().lower()
    for k in ("jump", "crouch"):          # tolerate hedged prose like "standing (low confidence)"
        if t.startswith(k):
            return k
    return "standing"


raw = extract_json(OUTFILE.read_text(encoding="utf-8", errors="replace"))
if not raw:
    raise SystemExit(f"could not extract workflow JSON from {OUTFILE}")
data = json.loads(raw)
pack = json.loads(SPANS.read_text(encoding="utf-8"))
by_cs = {ln["cs"]: ln for ln in pack["lineups"]}

# Resolve the callout table from the PACK's map, not from a default. Silently reusing Summit's
# table on another map would map callouts onto zones that map does not even have.
MAP_SLUG = pack.get("map_slug")
CALLOUTS = CALLOUTS_BY_MAP.get(MAP_SLUG)
if CALLOUTS is None:
    raise SystemExit(f"ABORT - no callout table for map {MAP_SLUG!r}. Add one to CALLOUTS_BY_MAP "
                     f"(derive it with `derive_callouts.py {MAP_SLUG}` rather than by hand) before "
                     f"reconciling; --apply-stand would otherwise assign zones from another map.")

passed, failed, ungated, vetoed = [], [], [], []
for r in data.get("results", []):
    it = r.get("item") or {}
    v = r.get("verdict") or {}
    loc = r.get("loc")
    rec = (it.get("nn"), it.get("cs"), loc, r.get("status"), v)
    ok = r.get("status") == "GATE_PASSED" and spans_ok(loc)
    if ok:
        # A gate PASS is necessary but not sufficient: the gate never checks event ordering.
        good, why = spans_ordered(loc)
        if not good:
            vetoed.append(rec + (why,))
            ok = False
    (passed if ok else failed).append(rec)
    # status=FAILED_GATE with NO verdict means the gate agent DIED before judging (session limit,
    # API error) - it is "never judged", not "judged and refused". Surfaced separately so it is
    # not re-localized: the localize payload and its verify card are intact and need only a gate.
    if not ok and r.get("status") == "FAILED_GATE" and not r.get("verdict") and spans_ok(loc):
        ungated.append(rec)
passed.sort(); failed.sort(); ungated.sort(); vetoed.sort()

print(f"{AGENT}: GATE_PASSED={len(passed)}  FAILED={len(failed)}  (of {len(data.get('results', []))})\n")
if vetoed:
    print("--- VETOED by span ordering (gate passed them; the arithmetic did not) ---")
    for nn, cs, _loc, _st, _v, why in vetoed:
        print(f"  #{nn} cs={cs:5} {by_cs.get(cs, {}).get('title', '?')}")
        print(f"       {why}")
    print()
if ungated:
    print("--- NEVER ADJUDICATED (gate agent died; re-GATE these, do NOT re-localize) ---")
    for nn, cs, _loc, _st, _v in ungated:
        print(f"  #{nn} cs={cs:5} {by_cs.get(cs, {}).get('title', '?')}")
    print()
if failed:
    print("--- FAILED (dropped from ship set; retry with locModel:'opus') ---")
    for nn, cs, _loc, st, v in failed:
        ln = by_cs.get(cs, {})
        print(f"  #{nn} cs={cs:5} {ln.get('ability','?'):11} {st:14} events={','.join(v.get('failed_events') or []) or '-'}")
        print(f"       {ln.get('title','?')}  |  {(v.get('reason') or '')[:100]}")

# Advisory only â€” author labels win, but a disagreement is worth eyeballing.
SIDE = {"attacker": "side_a", "defender": "side_b", "side_a": "side_a", "side_b": "side_b"}
flags = []
for nn, cs, loc, _st, _v in passed:
    ln = by_cs[cs]
    ls = SIDE.get(str(loc.get("side", "")).lower())
    if ls and ls != ln["side"]:
        flags.append(f"  #{nn} cs={cs} SIDE: loc={loc.get('side')}({ls}) vs author={ln['side']}  :: {ln['title']}")
    if loc.get("ability") and loc["ability"] != ln["ability"]:
        flags.append(f"  #{nn} cs={cs} ABILITY: loc={loc['ability']} vs author={ln['ability']}  :: {ln['title']}")
print(f"\n--- ADVISORY disagreements (author label kept; verify by card if suspicious): {len(flags)} ---")
print("\n".join(flags) if flags else "  none")
print("\ntechnique:", dict(Counter(norm_tech(loc) for _, _, loc, _, _ in passed)))

if APPLY_ABILITY:
    # Report what the localizer actually called, before writing anything.
    calls = Counter()
    recovered, unresolved = [], []
    for nn, cs, loc, _, _ in passed:
        slug, note = resolve_ability(loc.get("ability"))
        if slug:
            calls[slug] += 1
            if note:
                recovered.append((nn, cs, slug, note))
        else:
            unresolved.append((nn, cs, loc.get("ability"), note))
    print(f"\n--- ABILITY calls from localizer (author gave none; localizer wins) ---")
    print("  ", dict(calls))
    if recovered:
        print(f"  parsed out of a prose answer: {len(recovered)}")
        for nn, cs, slug, note in recovered:
            print(f"    #{nn} cs={cs} -> {slug}  ({note})")
    if unresolved:
        # Loud, because the consequence is shipping the SKELETON'S GUESS, which may be wrong.
        print(f"  !! UNRESOLVED: {len(unresolved)} row(s) will SHIP THE SKELETON'S PROVISIONAL "
              f"ability, which may be wrong â€” verify each by card:")
        for nn, cs, a, note in unresolved:
            prov = next((ln.get("ability") for ln in pack["lineups"] if ln.get("cs") == cs), "?")
            print(f"    #{nn} cs={cs} localizer said {a!r} â€” {note}; pack keeps {prov!r}")

def author_gave_stand(ln):
    """True when the chapter title itself names the throwing spot ('... From Mid')."""
    return bool(re.search(r"\bfrom\s+\S", ln["title"], re.I))


if APPLY_STAND:
    changed, unmapped = [], []
    for nn, cs, loc, _, _ in passed:
        ln = by_cs[cs]
        if author_gave_stand(ln):
            continue
        z = stand_zone_from_loc(loc.get("stand_loc"))
        if z is None:
            unmapped.append((nn, cs, loc.get("stand_loc")))
        elif z != ln["stand"]:
            changed.append((nn, cs, ln["stand"], z, loc.get("stand_loc"), ln["title"]))
    print(f"\n--- STAND overrides from localizer (only where the title gave no 'From X') ---")
    print(f"  {len(changed)} would change, {len(unmapped)} unmappable")
    for nn, cs, old, new, raw, title in changed:
        print(f"    #{nn} cs={cs:5} {old:8} -> {new:8}  (saw {raw!r})  :: {title}")
    for nn, cs, raw in unmapped:
        print(f"    UNRESOLVED #{nn} cs={cs:5} stand_loc={raw!r} â€” kept the skeleton's guess")

if APPLY:
    keep_cs = {cs: loc for _, cs, loc, _, _ in passed}
    # Rows this run actually adjudicated. Under --merge everything else is left alone; without
    # it the pack collapses to `passed`, which is only correct for a FIRST pass over the full set.
    run_cs = keep_cs.keys() | {cs for _, cs, _, _, _ in failed}
    kept, untouched = [], 0
    for ln in pack["lineups"]:
        loc = keep_cs.get(ln["cs"])
        if not loc:
            if MERGE and ln["cs"] not in run_cs:
                kept.append(ln)          # not in this run — first pass already localized it
                untouched += 1
            continue
        ln["spans"] = {k: [round(float(loc[k][0]), 2), round(float(loc[k][1]), 2)]
                       for k in ("stand", "aim", "throw", "landing")}
        ln["technique"] = norm_tech(loc)
        if APPLY_ABILITY:
            slug, _ = resolve_ability(loc.get("ability"))
            if slug:
                ln["ability"] = slug
        if APPLY_STAND and not author_gave_stand(ln):
            z = stand_zone_from_loc(loc.get("stand_loc"))
            if z:
                ln["stand"] = z
        kept.append(ln)
    pack["lineups"] = kept
    note_ab = " ability from localizer (author unlabelled)." if APPLY_ABILITY else ""
    # The map name comes from --pack, not the literal "Summit": this script predates --pack and
    # stamped every multi-map pack as a Summit pack, which is exactly the kind of wrong-map label
    # that cost a full re-localize on brimstone/split.
    map_name = str(pack.get("map_slug") or PACK).replace("-", " ").upper()
    # A note written by hand (the brimstone/haven chapter-title warning) carries information this
    # line cannot regenerate, so keep it rather than overwriting it.
    prior = str(pack.get("note") or "")
    keep = "" if (not prior or " gate-passed, " in prior) else f" {prior}"
    pack["note"] = (f"{AGENT} {map_name} lineups from {pack['video_id']}; {len(kept)} gate-passed, "
                    f"{len(failed)} dropped as un-gated.{note_ab}{keep}")
    SPANS.write_text(json.dumps(pack, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    extra = f"; {untouched} carried over untouched from an earlier pass" if MERGE else ""
    print(f"\nAPPLIED -> {SPANS}  ({len(kept)} kept{extra})")
else:
    print("\n(dry run â€” pass --apply to write spans back)")
