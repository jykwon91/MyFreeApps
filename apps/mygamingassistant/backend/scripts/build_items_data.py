"""The static per-agent tables build_items.py reads a chapter title AGAINST.

Split out for the reason make_instructions_data.py was: only the CORPUS grows. Every new agent
adds an UNLABELLED entry and an ABILITY_WORDS row, every new source can add a SIDE_PHRASES idiom,
and none of that changes a line of the logic that consumes them -- but it was pushing a stable file
back over the repo's 500-LOC growth guard on every batch.

Three tables, all consumed by build_items.py:
  UNLABELLED     agent -> (default slug, the a|b hedge prose) for agents whose sources do not label
                 which of two visually-similar abilities a chapter shows.
  SIDE_PHRASES   measured title idioms that imply a side (tier 2 of the side resolution).
  ABILITY_WORDS  agent -> [(pattern, slug)] for reading the ability off the author's own words.

Sibling import: these scripts run as `python scripts/build_items.py`, so scripts/ is sys.path[0].
"""
UNLABELLED = {
    "fade": ("haunt", "haunt|seize - the author does NOT label it, so the LANDING may legitimately "
             "be EITHER a hovering opened watching EYE (haunt) OR a flat spreading ground INK POOL "
             "(seize); judge the deploy onset, not which of the two it is"),
    "phoenix": ("hot-hands", "curveball|hot-hands - the author does NOT label it, so the LANDING "
                "may legitimately be EITHER a white FLASH burst in the air from a curving orb "
                "(curveball) OR an orange ground FIRE pool from a straight lob (hot-hands); judge "
                "the deploy onset, not which of the two it is"),
    # Viper is the first agent whose hedge is reached by DESIGN rather than by the author being
    # silent. Snapiex brackets the utility in all 14 titles, so ABILITY_WORDS resolves 11 outright;
    # the other 3 are bracketed "[Toxic Screen - Poison Cloud]" and match TWO patterns, which the
    # len(hits)==1 guard turns into this hedge. That is the right answer, not a miss: those chapters
    # genuinely deploy two utilities, and picking whichever pattern sat higher in the table would be
    # a coin flip recorded as a fact. The localizer reports which deploy it actually pinned.
    "viper": ("toxic-screen", "toxic-screen|poison-cloud|snake-bite - this chapter is a COMBO: the "
              "author's own title brackets TWO utilities, and both are deployed. A toxic screen is "
              "a long WALL of green gas that rises along a line from emitters; a poison cloud is a "
              "thrown orb that blooms into one SPHERE of green gas at the spot it lands; a snake "
              "bite is a canister that shatters into a flat corrosive ACID POOL on the ground. "
              "Localize the CLEAREST single complete deploy, name which one you pinned, and say in "
              "NOTES roughly when the other is deployed so it is not silently lost"),
    "brimstone": ("brim-incendiary", "brim-incendiary|sky-smoke - the author does NOT label it, so "
                  "the LANDING may legitimately be EITHER an orange burning MOLLY pool "
                  "(brim-incendiary) OR a large dome SMOKE bloom (sky-smoke); judge the deploy "
                  "onset, not which of the two it is"),
    # KAY/O is the first THREE-way agent here. The hedge is correspondingly weaker than a two-way
    # one, which is the argument for never reaching it: every plate on the Sunset source names the
    # utility outright, so ABILITY_WORDS resolves all 41 rows and this string stays unused.
    "kay-o": ("flashdrive", "flashdrive|zero-point|fragment - the author does NOT label it, so the "
              "LANDING may legitimately be a white FLASH burst in the air from a thrown disc "
              "(flashdrive), a KNIFE that sticks where it lands and opens a wide green suppression "
              "dome (zero-point), or a bouncing grenade that settles into repeated explosive "
              "PULSES on the ground (fragment); judge the deploy onset, not which of the three"),
    # Sova's two throwables are far easier to tell apart on the LANDING than any other agent's pair
    # here — one hovers and sweeps, the other detonates and is gone — so the hedge is unusually
    # strong. It should still never be reached: the Sunset plate labels all 33.
    "sova": ("recon", "recon|shock - the author does NOT label it, so the LANDING may legitimately "
             "be EITHER a bolt that STICKS to a surface and emits repeating expanding SCAN pulses "
             "that tag enemies through walls (recon) OR a dart that DETONATES on impact in a single "
             "electric burst doing damage and leaving nothing behind (shock); judge the deploy "
             "onset, not which of the two it is"),
}

# Phrase -> side, measured against the shipped corpus with derive_side.py (1128 lineups, 2026-07-29).
# Only phrases that came back CONSISTENT are here; a SPLIT phrase is evidence of nothing and is
# deliberately absent so it falls through to --side-default instead of borrowing a majority.
#
# ORDER MATTERS — first match wins, so every compound sits above the bare word it contains.
# "Afterplant" is the case that forces it: `\bplant\b` does NOT match inside it (no word boundary),
# so without its own entry an afterplant molly reaches the bare-plant rule only by accident of
# spacing — "After Plant" would resolve and "Afterplant" would abort.
SIDE_PHRASES = [
    (r"\bafter[- ]?plant\b", "side_a",
     "3/3 shipped 'afterplant' lineups are attacker — thrown by the side that planted"),
    (r"\bpost[- ]?plant\b", "side_a", "24/24 shipped 'post plant'/'postplant' lineups are attacker"),
    (r"\banti[- ]?plant\b", "side_b",
     "denies the enemy plant; 3/3 shipped 'antiplant' and 70/70 'retake' lineups are defender"),
    (r"\bretake\b", "side_b", "70/70 shipped 'retake' lineups are defender"),
    (r"\bexecute\b", "side_a", "5/5 shipped 'execute' lineups are attacker — the attacking entry"),
    (r"\bplant\b", "side_a", "48/48 shipped 'plant' lineups are attacker (post-plant utility)"),
]

# The creator's on-screen ability line NAMES the utility, which resolves the a|b ambiguity that
# UNLABELLED exists to hedge: Brimstone's Sunset plate reads "Afterplant Molly" on all 23 of its
# afterplant rows, and a molly is the incendiary, not the sky smoke. Only words that pick exactly
# ONE of an agent's two candidates are listed — anything else falls through to the hedge prose so
# the localizer's gate still decides rather than being told a wrong answer confidently.
ABILITY_WORDS = {
    "brimstone": [(r"\b(molly|molotov|incendiary|incend|fire)\b", "brim-incendiary"),
                  (r"\b(smoke|smokes|sky)\b", "sky-smoke")],
    "phoenix": [(r"\b(molly|molotov|hot.?hands|fire)\b", "hot-hands"),
                (r"\b(flash|curveball|curve)\b", "curveball")],
    "fade": [(r"\b(haunt|eye)\b", "haunt"), (r"\b(seize|ink)\b", "seize")],
    # Deliberately ONLY the three official ability names, with no loose synonym. The temptation is
    # to add "wall" for the screen, "orb"/"smoke" for the cloud and "molly" for the snake bite, as
    # the other agents' tables do — but this source's whole ability signal is a bracket that spells
    # the names out, and a loose synonym can only ever make a row match a SECOND pattern and fall to
    # the hedge. The narrow table is what keeps 11 of 14 rows author-labelled. Add a synonym only if
    # a future source actually needs it, and check the combo titles still resolve to exactly two.
    # Tseeky's Abyss source needed exactly that: its plates read "Attacker Molly", "Attacker Wall",
    # "Defender Smoke" — one plain word each, never the official name. None of the three words
    # occurs in any Snapiex bracket, so its 11 single + 3 combo rows resolve as before.
    "viper": [(r"\b(snake.?bite|molly|molotov)\b", "snake-bite"),
              (r"\b(poison.?cloud|smoke|orb)\b", "poison-cloud"),
              (r"\b(toxic.?screen|wall)\b", "toxic-screen")],
    # First agent with THREE candidates. Order is irrelevant here — the resolver collects the SET of
    # matching patterns against the plate's role line only and demands exactly one, so a plate naming
    # two utilities falls back to the hedge instead of picking whichever sits higher. That guard is
    # what makes a three-way table safe: KAY/O's Sunset plates read exactly "Attacker Flash",
    # "Defender Knife", "Attacker Molly" — one word each. (Titles are NOT searched for ability words,
    # which is just as well: a chapter in the FLASH section is titled "...Pop Flash For Nerds" and a
    # title-searching resolver would have to disentangle that from the knife section's own titles.)
    "kay-o": [(r"\b(knife|zero.?point|suppress\w*)\b", "zero-point"),
              (r"\b(molly|molotov|frag|fragment|grenade|nade)\b", "fragment"),
              (r"\b(flash|flashdrive|pop.?flash)\b", "flashdrive")],
    # `dart` is deliberately NOT in the recon pattern even though "recon dart" is common speech,
    # because Sova's OTHER ability is literally called Shock Dart: the Sunset plates read "Attacker
    # Recon" and "Att Shock Dart", so a `dart` alternative would make every shock row match BOTH
    # patterns, hit the len(hits)==1 guard, and silently demote all 7 of them to the hedge. Matching
    # narrowly on the words that pick exactly one ability is the whole contract of this table.
    # Plurals match because creators write the plate in whatever number the lineup needs: Tseeky's
    # Abyss source labels its three double-dart chapters "Double Shocks", and a singular-only
    # `\bshock\b` does not match "Shocks" -- the trailing s eats the word boundary. All three rows
    # fell silently to the a|b hedge with the author's own label sitting right there on screen,
    # which is the exact failure this table exists to prevent. Kept narrow (an optional trailing s,
    # nothing else) so no row can start matching BOTH patterns and land back in the hedge anyway.
    "sova": [(r"\b(recons?|recon.?bolts?|bolts?)\b", "recon"),
             (r"\b(shocks?|shock.?darts?)\b", "shock")],
}
