"""Smoke-test the per-map callout -> zone mapping against the real tables.

Imports the shipped table module directly, so the table under test is the one reconcile
actually uses — no duplicated copy that can silently drift.

  python test_callouts.py
"""
import re

from lineup_callouts import CALLOUTS_BY_MAP as BY_MAP
from lineup_callouts import callout_to_zone as c2z
from lineup_callouts import target_text

SUMMIT_CASES = [
    ("A Main", "a-main"), ("A Lobby", "a-main"), ("A Site", "a-site"), ("A Garden", "a-site"),
    ("A Link", "mid"), ("A Cave", "a-site"), ("A Art", "a-site"),
    ("B Main", "b-main"), ("B Lobby", "b-main"), ("B Site", "b-site"), ("B Hut", "b-site"),
    ("B Drop", "b-site"), ("B Heaven", "b-site"), ("B Link", "mid"),
    ("B Gym", "ct-spawn"), ("B Gym/CT", "ct-spawn"), ("CT", "ct-spawn"), ("CT Spawn", "ct-spawn"),
    ("T Spawn", "t-spawn"), ("Attacker Spawn", "t-spawn"), ("Defender Spawn", "ct-spawn"),
    ("Mid", "mid"), ("Middle", "mid"), ("Top Mid", "mid"), ("Bottom Mid", "mid"),
    ("Mid Tiles", "mid"), ("Mid Fountain", "mid"), ("Mid Bend", "mid"), ("Tiles", "mid"),
    ("A Main/Site", "a-main"),                 # slash form must not resolve to a-site
    ("mid top, near the fountain", "mid"),     # prose form
    ("", None), ("somewhere unlabelled", None),
]

ASCENT_CASES = [
    ("A Main", "a-main"), ("A Lobby", "a-main"), ("A Tree", "a-main"), ("A Door", "a-main"),
    ("A Site", "a-site"), ("A Heaven", "a-site"), ("A Dice", "a-site"), ("A Wine", "a-site"),
    ("A Rafters", "a-site"), ("A Generator", "a-site"), ("A Backsite", "a-site"),
    ("A Green", "a-site"), ("A Short", "a-site"), ("A Hell", "a-site"),
    ("B Main", "b-main"), ("B Lobby", "b-main"),
    ("B Site", "b-site"), ("B Stairs", "b-site"), ("B Boat", "b-site"), ("B Corner", "b-site"),
    ("B Front", "b-site"), ("B Back", "b-site"),
    # Market is Ascent's own zone; it must NOT collapse into mid or b-main.
    ("Market", "market"), ("B Market", "market"), ("Mid Market", "market"),
    ("Mid", "mid"), ("Middle", "mid"), ("Mid Link", "mid"), ("Mid Cubby", "mid"),
    ("Catwalk", "mid"), ("Pizza", "mid"), ("Top Mid", "mid"), ("Bottom Mid", "mid"),
    ("CT Spawn", "ct-spawn"), ("Attacker Spawn", "t-spawn"),
    # Riot's verbatim strings, which read_cards.py pulls off the in-game location readout —
    # "defender spawn" does not match "Defender Side Spawn" on a word boundary.
    ("Defender Side Spawn", "ct-spawn"), ("Attacker Side Spawn", "t-spawn"),
    # "B Spawn" is the back of B, NOT the defenders' spawn: Tseeky's B SPAWN molly is thrown from
    # B Main and lands against the B-site box on the minimap, while the same video's lineup whose
    # readout literally says "Defender Side Spawn" marks top-centre, nowhere near it.
    ("B Spawn", "b-site"),
    # Community plant-spot / role names Riot does not carry as callouts (see callout_zones.py):
    # "<SITE> <spot> N" plants on that site, and antiplant denies a plant on that site.
    ("A Default Plant 1", "a-site"), ("B Default Plant 3", "b-site"), ("A Safe Plant 2", "a-site"),
    ("A Antiplant 1", "a-site"), ("B Antiplant", "b-site"), ("A Gen", "a-site"),
    ("A Back Dice", "a-site"),
    # Hyphenated spelling of the same thing. Punctuation is normalized to spaces before matching,
    # so these do NOT reach the "a antiplant" entry and needed their own. Bonsai's Ascent Phoenix
    # source writes every one of them this way.
    ("A Anti-Plant", "a-site"), ("B Anti-Plant", "b-site"),
    # A Garden is a real Riot callout that no zone box contains; nearest box is a-site (0.097)
    # ahead of ct-spawn (0.128) by zone_rank.py's box distance.
    ("A Garden", "a-site"),
    # The A Ultimate Orb sits in A Main, not on A site: on cs=182/198 of the Bonsai source the
    # molly burns beside the visible orb in a corridor whose readout says "A Main". This is the
    # case the "A <spot> -> a-site" family rule would have got wrong.
    ("A Orb 1 (Combo)", "a-main"), ("A Orb 3", "a-main"),
    ("A Anti-Peak (Combo)", "a-main"),   # curveball pops in A Main, thrown from A Lobby
    ("B Anti-Rush (Combo)", "b-site"),   # role phrase; names the site it defends
    # Role phrases name the site they serve. Real Fade/Ascent chapter titles.
    ("DEF A Retake 1 High", "a-site"), ("DEF B Retake 3", "b-site"),
    ("DEF A Support 2", "a-site"), ("DEF B Support 1", "b-site"),
    ("ATT A Site 5 Wine", "a-site"),
    # A parenthetical is a neighbouring landmark, never the primary callout — same rule as
    # stand_loc. Real Fade/Ascent titles; without the strip, bare "market" outranks "middle".
    ("DEF Middle Best (Market)", "mid"), ("DEF Middle 2 Simple (Market)", "mid"),
    ("DEF B Lobby/Mid Link (Amazing for pushes)", "b-main"),
    ("A Site (near the tree side)", "a-site"),  # leading callout wins over the parenthetical
    ("", None), ("somewhere unlabelled", None),
]

SUNSET_CASES = [
    ("A Main", "a-main"), ("A Lobby", "a-main"),
    ("A Site", "a-site"), ("A Elbow", "a-site"), ("A Alley", "a-site"),
    ("B Main", "b-main"), ("B Lobby", "b-main"),
    # Riot's B Site anchor is nearest b-main (0.021) because it sits at the room's west DOORWAY —
    # the same anchor the seeding pass hand-placed via OVERRIDE. The name must still win.
    ("B Site", "b-site"), ("B Boba", "b-site"), ("Boba", "b-site"), ("B Stairs", "b-site"),
    ("B Market", "market"), ("Market", "market"), ("Market Stairs", "market"),
    ("Mid", "mid"), ("Middle", "mid"), ("Mid Courtyard", "mid"), ("Mid Bottom", "mid"),
    ("Bottom Mid", "mid"), ("Mid Tiles", "mid"), ("Tiles", "mid"),
    # ct-spawn is nearer (0.071 vs 0.114) but both shipped maps map top mid -> mid, and every
    # other Mid-family Sunset callout resolves to mid.
    ("Top Middle", "mid"), ("Top Mid", "mid"), ("Mid Top", "mid"),
    ("Attacker Side Spawn", "t-spawn"), ("Defender Side Spawn", "ct-spawn"),
    # A Link is a-site on SUNSET (d=0.019) and mid on SUMMIT. Per-map tables exist for this;
    # asserting both directions keeps a future "unify the tables" refactor honest.
    ("A Link", "a-site"),
    # Real chapter titles from the three Tseeky Sunset sources.
    ("A Default 1 From Lobby Fast", "a-site"), ("B Default 3 From Market", "b-site"),
    ("A Box Corner 2 From Elbow", "a-site"), ("B Boxes 4 From Boba (Do 1 step backwards)", "b-site"),
    ("A Anti Plant 1 From A Link", "a-site"), ("B Anti Plant 3 From Market Stairs", "b-site"),
    ("A Execute Molly (Can be used as a post plant lineup too)", "a-site"),
    ("A Retake Molly", "a-site"), ("A Support", "a-site"), ("B Support", "b-site"),
    ("A Info 1", "a-site"), ("A Elbow 1 Fast", "a-site"),
    # Slash forms, BOTH idioms. These two are ONE compressed callout: the first segment is a bare
    # "A"/"B" that matches nothing, so the lookup falls back to the whole string, which normalizes
    # to "a mid info"/"b mid info" — punctuation-free entries the table carries outright. Spelled
    # WITH the slash the entry would be unreachable and both would silently land on bare "mid".
    ("A/Mid Info", "a-site"), ("B/Mid Info", "b-site"),
    # ...and these join two FULL callouts, where the first names the destination. Each one is
    # deliberately a case where the second callout's zone is DIFFERENT and sits HIGHER in the table,
    # so a whole-string scan returns the wrong answer: `b site` outranks `b market`, and `a site`
    # outranks `a elbow`. "A Main/Site" and "B Gym/CT" above are NOT such cases — they passed under
    # the old whole-string scan by accident of table order, which is why they never caught this.
    ("B Market/B Site God Arrow", "market"), ("Market/B Site", "market"),
    ("A Elbow/A Site", "a-site"),  # both a-site; pins that the split does not lose a correct answer
    # The bare `boxes`/`stairs` entries at the tail of the Sunset table map to b-site, so an A-side
    # form has to sit above them or it gets swallowed. "A Boxes" resolved to B SITE until `a boxes`
    # was added — a real Snapiex title, and the failure was silent (a valid zone, just the wrong
    # half of the map). Both halves are pinned here so a future table reorder cannot undo either.
    ("A Boxes [Snake Bite]", "a-site"), ("B Boxes", "b-site"), ("A Box Corner", "a-site"),
    # A slash inside a parenthetical clarification must NOT trigger the split — cutting there would
    # hand the lookup "B Site (at the B Main doorway" and move a correct b-site stand to b-main.
    ("B Site (at the B Main doorway/mouth)", "b-site"),
    ("Middle 2 Bottom Mid", "mid"), ("Middle 1 Tiles Barrier", "mid"),
    ("B Market (Scans through plants)", "market"),
    # --- the "From <stand>" hijack, pinned in both directions ------------------------------
    # These are the two that actually failed. The stand callout must never be read as the target,
    # so each case names a stand whose zone DIFFERS from the answer — a table-ordering "fix" that
    # happened to satisfy them would still break here.
    ("B Default 3 From Market", "b-site"),            # stand market  -> target b-site
    ("B Anti Plant 3 From Market Stairs", "b-site"),  # stand market  -> target b-site
    ("A Default 2 From Mid", "a-site"),               # stand mid     -> target a-site
    ("Middle Best From B Main", "mid"),               # stand b-main  -> target mid
    ("A Anti Plant 2 From Alley", "a-site"),
    ("Market Retake From A Main", "market"),          # stand a-main  -> target market
    # Bare landmarks are last-resort fallbacks; a qualified term anywhere in the target clause
    # outranks them regardless of word order. This is the ordering hazard the from-strip alone
    # would have left armed.
    ("B Default 2 Market Side", "b-site"),
    ("A Retake Elbow Side", "a-site"),
    ("", None), ("somewhere unlabelled", None),
]

# --- the REVERSED `<STAND> to <TARGET>` grammar ------------------------------------------------
# nic.vallabh's breeze/Phoenix source writes the stand FIRST ('A Lobby to A Shop'), the opposite of
# the "<TARGET> from <STAND>" sources. Such a title carries no "from", so the whole string used to
# be matched and the first table hit — the STAND — won, shipping every row with stand and target
# swapped.
#
# These cases are asserted on ASCENT, and every one of them is DISCRIMINATING: the pre-fix path
# returns the value in the trailing comment, which is the STAND. That property was verified rather
# than assumed — the first draft of this block used 'A Main to A Site', which passes identically
# with and without the fix because Ascent's table happens to order "a site" ahead of "a main". A
# case that cannot fail is not a test.
#
# The last two cases pin the EVIDENCE GATE: "to" is an ordinary English word, and the split must be
# refused unless BOTH sides resolve to a zone.
REVERSED_CASES = [
    ("A Heaven to B Site", "b-site"),        # pre-fix -> 'a-site' (the stand)
    ("A Heaven to B Main", "b-main"),        # pre-fix -> 'a-site'
    ("A Heaven to A Main", "a-main"),        # pre-fix -> 'a-site'
    ("A Heaven to B Lobby", "b-main"),       # pre-fix -> 'a-site'
    # Right side names no callout -> not the reversed grammar -> fall back to the whole string.
    ("A Site to win the round", "a-site"),
    # Left side names no callout -> likewise.
    ("Welcome to B Site", "b-site"),
    # The SPACED DASH is the same grammar — Quible's Haven sources write 'A Wine - A Site'.
    ("A Heaven - B Site", "b-site"),          # pre-fix -> 'a-site' (the stand)
    ("A Heaven - B Main", "b-main"),          # pre-fix -> 'a-site'
    # ...and the gate is what makes the dash safe. AiltonVG's real Breeze titles put a dash before
    # a NON-callout, so the split must be REFUSED and the whole string matched. Without the gate
    # these lose their leading 'Site A'/'Site B' and resolve to None.
    # (asserted on breeze, where 'site a'/'site b' exist — see the loop's per-map pairing)
    # A hyphen INSIDE a word must never split: 'Anti-Plant' has no surrounding whitespace.
    ("A Anti-Plant", "a-site"),
]

# Same reversed-grammar contract, asserted against the BREEZE table because these are that map's
# real chapter titles and 'site a' / 'site b' only exist there.
BREEZE_REVERSED_CASES = [
    ("Site A Attack - Lineup 1", "a-site"),
    ("Defense Site A - Lineup Main", "a-site"),
    ("Defense Site B - Lineup Retake site", "b-site"),
    ("Site B Attack - Capture backsite", "b-site"),
    ("A Orange to Mid Entrance", "mid"),       # pre-fix -> 'a-site' (the stand)
    ("A Cubby to A Default Plant", "a-site"),
    ("B Half Wall to B Entrance Cubby", "b-main"),
]

# Haven is the only THREE-site map and the only one with no `mid`, `a-main` or `b-main` zone, so
# these cases are mostly about where the callouts that WOULD go there actually land.
HAVEN_CASES = [
    ("A Site", "a-site"), ("B Site", "b-site"), ("C Site", "c-site"),
    ("A Lobby", "a-lobby"), ("C Lobby", "c-lobby"), ("C Garage", "garage"),
    ("Attacker Side Spawn", "t-spawn"), ("Defender Side Spawn", "ct-spawn"),
    ("A Tower", "a-site"), ("A Long", "a-site"), ("B Back", "b-site"),
    ("A Garden", "a-lobby"), ("C Cubby", "c-lobby"), ("C Long", "c-lobby"),
    ("C Window", "garage"),                      # d=0.034 — the garage mouth, not C site
    # --- the CONNECTOR rule, pinned in both directions ----------------------------------------
    # "A Sewer" and "C Link" are the two callouts whose NAME and GEOMETRY disagree: both are named
    # for the site they lead to but physically sit against B. The pin follows the geometry. Each is
    # asserted against the site its name would suggest, so a future "apply the family rule
    # everywhere" refactor cannot quietly flip them back.
    ("A Sewer", "b-site"), ("C Link", "b-site"), ("Sewer", "b-site"),
    ("A Link", "a-site"),                        # the non-conflicting mirror case
    # --- the Mid family with no `mid` zone to land in ------------------------------------------
    ("Mid Courtyard", "a-lobby"), ("Mid Window", "a-lobby"), ("Mid Doors", "c-lobby"),
    ("Middle", "a-lobby"), ("Mid", "a-lobby"),
    # --- Quible's `<STAND> - <TARGET>` dash grammar, from the real Haven chapter lists -----------
    # The first two are DISCRIMINATING — verified, not assumed: without the reversed-grammar split
    # the whole string is matched and the first table hit is the STAND, shown in the trailing
    # comment. The two after them are not (Haven's table order happens to give the same answer
    # either way); they are here as coverage of the real chapter list, not as tests of the split.
    ("A Lobby - A Site", "a-site"),              # pre-fix -> 'a-lobby' (the stand)
    ("Defender Spawn - B Site", "b-site"),       # pre-fix -> 'ct-spawn' (the stand)
    # "A Wine - A Site" used to sit here, from the same chapter list. It is gone because the
    # chapter list is wrong: that video is C-side, and "A Wine" is an Ascent callout with no
    # Haven counterpart. The dash grammar is covered by the real Haven pairs around it.
    ("C Cubby - C Site", "c-site"), ("B Main - B Site", "b-site"),
    # --- the EVIDENCE GATE is what makes the dash safe on this map ------------------------------
    # Quible's Phoenix/Haven source writes the dash the OTHER way round — "<TARGET> - <role>", where
    # the right side is not a callout at all. The split must be REFUSED so the whole string is
    # matched and the leading site wins. This is the single reason the Haven table carries no bare
    # `defender` entry. That is not a theoretical worry — appending ('defender','ct-spawn') to the
    # table was tried, and all three rows below flip from their correct site to ct-spawn. These
    # cases return the same value with and without the reversed-grammar split BY DESIGN: they are
    # regression guards on the table's contents, not tests of the split.
    ("A Site - Defender Molly", "a-site"),
    ("B Site - Defender Molly", "b-site"),
    ("C Site - Defender Molly", "c-site"),
    ("A Site - Attacker Molly", "a-site"),
    ("B Main - Stair", "b-site"),                # right side unresolvable -> whole string
    # --- Tseeky's bare titles ------------------------------------------------------------------
    ("A Long 1", "a-site"), ("C Site God Reveal", "c-site"), ("A Short 1 Simple", "a-site"),
    ("A Site 3 Post Plant", "a-site"), ("A Retake 1", "a-site"), ("C Push", "c-site"),
    ("A Early Info", "a-site"), ("C Early Info", "c-site"),
    ("C Retake/Support 1", "c-site"), ("A Support/Retake", "a-site"),   # slash form
    ("", None), ("somewhere unlabelled", None),
]

# Lotus is the widest map: three sites AND three mains AND a mid, nine zones, and six Riot callouts
# whose name disagrees with the nearest zone box — more than anywhere else. Each of those six is
# asserted below against the answer its NAME would suggest where the two differ, so the uniform
# rule in reconcile_agent.py cannot be quietly replaced by per-callout special-casing.
LOTUS_CASES = [
    ("A Site", "a-site"), ("B Site", "b-site"), ("C Site", "c-site"),
    ("A Main", "a-main"), ("B Main", "b-main"), ("C Main", "c-main"),
    ("A Root", "a-main"), ("A Rubble", "a-main"), ("A Door", "a-main"),
    ("A Hut", "a-site"), ("A Top", "a-site"), ("A Tree", "a-site"), ("A Drop", "a-site"),
    ("A Stairs", "a-site"), ("B Pillars", "b-main"), ("B Upper", "b-site"),
    ("C Bend", "c-site"), ("C Hall", "c-site"), ("C Door", "c-main"), ("C Waterfall", "c-main"),
    ("Attacker Side Spawn", "t-spawn"), ("Defender Side Spawn", "ct-spawn"),
    # --- the six name/geometry conflicts ------------------------------------------------------
    # Name wins (nearest box far, or margin not decisive):
    ("A Lobby", "a-main"),      # nearest t-spawn 0.113 — far, so the name holds
    ("C Lobby", "c-main"),      # nearest t-spawn 0.120 — far; c-main is 0.234 and still correct
    ("C Gravel", "c-site"),     # mid/c-site/b-site within 0.015 of each other — a coin flip
    ("C Mound", "c-main"),      # b-main 0.057 vs c-main 0.077 — only 1.35x, not decisive
    # Geometry wins (connectors, close and decisive):
    ("C Link", "mid"),          # mid 0.069 vs the nearest C option 0.126
    ("A Link", "mid"),          # overrides even nearest (b-site 0.032) — see the table's note
    # Riot's own "B Site" point is inside BOTH the b-site and mid boxes; the name breaks the tie.
    ("B Site", "b-site"),
    # --- THE LEADING TAG, the bug this map surfaced --------------------------------------------
    # hoverboarD tags the ability at the FRONT. The parenthetical strip kept everything BEFORE the
    # first bracket, which for these is the empty string, so every one of that creator's rows
    # resolved to no target at all — 34 of 64 unresolved titles on the first Lotus coverage run,
    # and hoverboarD is a source on four maps. All three are DISCRIMINATING: pre-fix they return
    # None, because target_text handed callout_to_zone an empty string.
    ("[Def Eye] A Tree to A Main/Rubble", "a-main"),
    ("[Atk Eye] B Pillars to C Mound", "c-main"),
    ("[Atk Tether] C Mound to C Site Pillar", "c-site"),
    ("[Def Tether] A Link to A Site", "a-site"),
    # A TRAILING parenthetical must still be stripped, not treated as a leading tag.
    ("A Open from A Root 2 (Alternative)", "a-site"),
    ("BEST Retake C Reveal (risky)", "c-site"),
    # --- Quible's bare-letter site form --------------------------------------------------------
    ("C - Attacker Molly", "c-site"), ("A - Defender Molly", "a-site"),
    ("A Site - Defender Molly", "a-site"), ("B Site - Defender Molly", "b-site"),
    # --- the `from` grammar, across four creators ----------------------------------------------
    ("B Pit from B Pillars", "b-site"),        # stand b-main -> target b-site
    ("B Pit from C Gravel", "b-site"),         # stand c-site -> target b-site
    ("C Safe from B Site", "c-site"),          # stand b-site -> target c-site
    ("C Pillar from C Lobby", "c-site"),       # stand c-main -> target c-site
    ("A Retake 1 From A Heaven", "a-site"),
    ("A Main 4 From A Barrier", "a-main"),
    ("A Default from Defender Side", "a-site"),
    ("A Main God Reveal 2 From B Site", "a-main"),
    ("A BACKSITE FROM DEFENDER SPAWN", "a-site"),
    ("C SAFE FROM C MOUND", "c-site"), ("C ALTERNATIVE FROM C LOBBY", "c-site"),
    ("C OPEN FROM B PILLARS", "c-site"),
    # The from-strip runs BEFORE the reversed-grammar split and returns immediately, so this title —
    # which contains BOTH "to" and "from" — must keep its "to" clause and match C Waterfall in it.
    ("Anti-Chamber Lineup to C Waterfall from C Lobby Barrier", "c-main"),
    ("Simple A Backsite", "a-site"), ("C God Retake", "c-site"), ("C Long Reveal", "c-main"),
    ("", None), ("somewhere unlabelled", None),
    # Genuinely site-less titles must stay UNRESOLVED rather than guess — this is what keeps the
    # coverage report meaningful, and it is why no bare single-letter entry exists.
    ("Simple Post-plant Reveal", None), ("Outro", None), ("GAMEPLAY", None),
]

# Split's own extra zone is `mail`, the same shape as Ascent's `market`. Its defining hazard is that
# Riot's callout for it is "Mid Mail" — a bare `mid` entry above it silently swallows every mail
# lineup into mid, which is why the A/B-twin pairs below are pinned in both directions too.
SPLIT_CASES = [
    ("A Site", "a-site"), ("B Site", "b-site"), ("A Main", "a-main"),
    ("A Lobby", "a-main"), ("A Ramps", "a-main"), ("A Sewer", "a-main"),
    ("A Screens", "a-site"), ("B Alley", "b-site"), ("B Garage", "b-main"),
    ("B Stairs", "b-main"), ("B Link", "b-main"), ("B Lobby", "b-main"),
    ("Attacker Side Spawn", "t-spawn"), ("Defender Side Spawn", "ct-spawn"),
    # `mail` must survive contact with the mid family.
    ("Mid Mail", "mail"), ("Mail", "mail"), ("B Mail", "mail"),
    ("Mid Top", "mid"), ("Mid Bottom", "mid"), ("Mid Vent", "mid"), ("Middle", "mid"),
    # --- the three A/B twins that forbid a bare form -------------------------------------------
    # Each pair resolves to a DIFFERENT zone, so a bare `tower` / `rafters` / `back` entry would be
    # a coin flip. Asserting both halves means a future "add the bare fallback" edit fails here
    # instead of silently landing half the rows on the wrong side of the map.
    ("A Tower", "a-site"), ("B Tower", "b-main"),
    ("A Rafters", "a-site"), ("B Rafters", "b-main"),
    ("A Back", "a-site"), ("B Back", "b-site"),
    # ...and the plant spot that must outrank the singular position entry above it.
    ("B Rafter Box Plant", "b-site"),
    # Riot has no "B Main" on Split; four creators use it anyway and its absence blocked their rows.
    ("B Main", "b-main"),
    # --- real chapter titles across all ten sources --------------------------------------------
    ("[Atk Tether] B Main to B Site Poster", "b-site"),      # leading tag + reversed grammar
    ("[Def Eye] A Rafters to A Lobby/Main (v1)", "a-main"),  # + slash + trailing parenthetical
    ("[Def Tether] A Cherry to A Site Elbow/Rat", "a-site"), # left side unresolvable -> no split
    ("A Rafters to A Default Plant", "a-site"),
    # DISCRIMINATING: pre-fix the whole string matched and "a lobby" (the stand) won -> a-main.
    ("A Lobby to A Site Cubby", "a-site"),
    ("B default from B Main", "b-site"), ("B site default from B main", "b-site"),
    ("B Site Exposed Plant from B Main", "b-site"),
    ("A safe from A Tower", "a-site"), ("A elbow from A Screens", "a-site"),
    ("A pocket from A Lobby", "a-site"), ("A screen from A Ramps", "a-site"),
    ("A back from A Screens", "a-site"), ("A site default from CT Screens", "a-site"),
    ("A Corner Plant", "a-site"), ("B Corner Plant", "b-site"),
    ("A Front Screen Plant", "a-site"), ("A Retake 2 Screens", "a-site"),
    ("B Open Plant 1 (Main / Heaven Plant)", "b-site"),
    ("B Antiplants", "b-site"),                              # plural needs its own entry
    ("", None), ("somewhere unlabelled", None),
    ("Outro", None), ("Fail Blooper", None),
]

ABYSS_CASES = [
    # Abyss seeds a-lobby / b-lobby as REAL zones — unlike Summit/Breeze, where the same
    # callout folds into a-main / b-main. Regression guard for copying the wrong convention.
    ("A Lobby", "a-lobby"), ("B Lobby", "b-lobby"),
    ("A Main", "a-main"), ("B Main", "b-main"), ("A Site", "a-site"), ("B Site", "b-site"),
    ("A Bridge", "a-site"), ("A Tower", "a-site"), ("A Link", "a-site"),
    ("A Security", "a-site"), ("A Secret", "a-site"),
    ("A Default", "a-site"), ("A Backsite", "a-site"),
    ("B Tower", "b-site"), ("B Heaven", "b-site"), ("B Default", "b-site"),
    ("B Backsite", "b-site"),
    ("B Nest", "b-main"), ("B Danger", "b-main"), ("B Window", "b-main"), ("B Rope", "b-main"),
    # Abyss's A Link is a-site while its B Link is mid — the geometry genuinely differs
    # (a-site d=0.098 vs a tie at B). This pair is why no BARE "link" entry exists.
    ("B Link", "mid"),
    ("A Vent", "mid"), ("Library", "mid"), ("Mid Library", "mid"), ("Mid Catwalk", "mid"),
    ("Mid Bend", "mid"), ("Mid", "mid"), ("Middle", "mid"),
    ("Top Mid", "mid"), ("Bottom Mid", "mid"), ("Mid Top", "mid"), ("Mid Bottom", "mid"),
    ("CT", "ct-spawn"), ("CT Spawn", "ct-spawn"), ("Defender Side Spawn", "ct-spawn"),
    ("Attacker Side Spawn", "t-spawn"), ("T Spawn", "t-spawn"),
    # This source names the destination with a bare letter; the single-letter entries are
    # last in the table, so anything more specific must still win.
    ("A", "a-site"), ("B", "b-site"),
    ("A Lobby to A Main", "a-main"), ("B Main to B Backsite", "b-site"),
    ("B Heaven to B Main & Rope", "b-main"), ("B Lobby to B (Postplant)", "b-site"),
    ("A Site/Backsite to A Lobby", "a-lobby"),   # slash form must not resolve to a-site
    ("", None), ("somewhere unlabelled", None),
]

def run():
    """Run every case table + invariant. Returns the failure count (0 == all passed)."""
    bad = 0
    for map_slug, cases in (("summit", SUMMIT_CASES), ("ascent", ASCENT_CASES),
                            ("sunset", SUNSET_CASES), ("ascent", REVERSED_CASES),
                            ("breeze", BREEZE_REVERSED_CASES), ("haven", HAVEN_CASES),
                            ("lotus", LOTUS_CASES), ("split", SPLIT_CASES),
                            ("abyss", ABYSS_CASES)):
        table = BY_MAP[map_slug]
        print(f"--- {map_slug} ({len(cases)} cases) ---")
        for raw, want in cases:
            # Call the SAME normalizer build_items.py uses for the target lookup, rather than
            # re-implementing part of it here. The old line mirrored only the parenthetical strip, so it
            # could not have caught the "From <stand>" hijack at all — the test agreed with the bug.
            # Pass the table exactly as build_items.py does. Without it target_text cannot evaluate the
            # reversed `<STAND> to <TARGET>` grammar, and the test would silently exercise a weaker
            # code path than production — the same way the pre-fix test agreed with the "From" bug.
            got = c2z(target_text(raw, table), table)
            ok = got == want
            bad += not ok
            print(f"  {'ok ' if ok else 'FAIL'} {raw!r:34} -> {got!r}" + ("" if ok else f"   want {want!r}"))

    # --- reachability invariant -------------------------------------------------------------------
    # callout_to_zone lowercases the SUBJECT and replaces every non-alphanumeric run with a space before
    # it searches, but it searches for the table entry VERBATIM. So an entry that is not already in
    # normalized form can never match anything — and it fails SILENTLY: the table still lists it, so a
    # reader (and I did) concludes the mapping is present while the lookup falls through to whatever
    # broader entry sits below it. That is how "A/Mid Info" resolved to mid despite an "a/mid info" row.
    # Asserting entry == normalize(entry) is exactly the reachability condition, and it catches
    # uppercase and doubled spaces too, not just punctuation.
    print("\n--- table entries are reachable (normalized form) ---")
    unreachable = 0
    for map_slug, table in sorted(BY_MAP.items()):
        for i, (word, slug) in enumerate(table):
            norm = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", word.lower())).strip()
            if norm != word:
                unreachable += 1
                print(f"  FAIL {map_slug}[{i}] {word!r} -> {slug}: normalizes to {norm!r}, so the "
                      f"verbatim search can never hit it. Spell the entry {norm!r}.")
    bad += unreachable
    entries = sum(len(t) for t in BY_MAP.values())
    print(f"  {'ok ' if not unreachable else '   '} {entries - unreachable}/{entries} entries across "
          f"{len(BY_MAP)} tables are reachable")

    # A map with no table must be absent, not silently defaulted — reconcile aborts on the None.
    # This walked sunset -> breeze -> haven -> lotus -> split as each table landed. All SEVEN pool maps
    # now have one, so it is repointed at Icebox: a real Valorant map that is deliberately OUT of the
    # operator's pool, so it stays un-tabled and the contract keeps being tested. If Icebox is ever
    # added, move this to another out-of-pool map (Fracture, Pearl, Bind, Abyss) rather than deleting
    # it — an untested fail-loud path is how an unknown map starts silently resolving to nothing.
    # Abyss was one of those spares until V26 Act 5 rotated it INTO the pool (Breeze out) and it
    # got a table of its own; Fracture, Pearl and Bind remain available if Icebox ever lands.
    print("\n--- fail-loud contract ---")
    unknown = BY_MAP.get("icebox")
    ok = unknown is None
    bad += not ok
    print(f"  {'ok ' if ok else 'FAIL'} unknown map 'icebox' has no table (reconcile aborts) -> {unknown!r}")

    total = (len(SUMMIT_CASES) + len(ASCENT_CASES) + len(SUNSET_CASES) + len(REVERSED_CASES)
             + len(BREEZE_REVERSED_CASES) + len(HAVEN_CASES) + len(LOTUS_CASES)
             + len(SPLIT_CASES) + len(ABYSS_CASES) + 1 + entries)
    print(f"\n{total - bad}/{total} passed")
    return bad


def test_callouts():
    """pytest entry point.

    scripts/ is collected by the backend suite (see test_dedup_lineups.py), so this file
    must be importable with no side effects. It previously ran at import and ended in a
    bare `raise SystemExit`, which aborts pytest collection with an INTERNALERROR even
    when every check passes.
    """
    assert run() == 0, "callout table checks failed — run `python test_callouts.py` for detail"


if __name__ == "__main__":
    raise SystemExit(1 if run() else 0)
