"""The eight LEGACY per-map callout tables build_cypher_pack.py was born with. DATA ONLY.

Split out of build_cypher_pack.py so the builder's logic can change without growing a file that
sits over the 500-LOC no-growth line. build_cypher_pack imports ZONES from here; see its
zone_table() for which (agent, map) pairs still read these tables.
"""

# Fine in-game callout -> the map's coarse fixture zone slug.
#
# LEGACY, FROZEN. These eight tables were hand-written for this builder before the
# project-wide per-map tables (scripts/callouts_<map>.py) existed, and they disagree with
# them on ~40 callouts -- Haven's bare "mid", Summit's "a garden", Ascent's "catwalk" and
# so on. Every pack built from them shipped against these readings, so re-pointing them at
# the shared table would silently reclassify a future re-run of a map already in prod.
# A map with NO entry here (abyss and everything after it) resolves through the shared
# table instead: see zone_table(). Do NOT add new maps here -- extend callouts_<map>.py,
# which the whole rest of the pipeline already reads, and which is checked against Riot's
# own coordinates by callout_zones.py. Reconciling the eight legacy tables away is tracked
# in the app's TECH_DEBT.md.
ZONES = {
    "ascent": {
        "a site": "a-site", "a": "a-site", "a back": "a-site", "a heaven": "a-site",
        "heaven": "a-site", "a rafters": "a-site", "rafters": "a-site",
        "a generator": "a-site", "generator": "a-site", "generator room": "a-site",
        "a tree": "a-site", "tree": "a-site", "a dice": "a-site", "dice": "a-site",
        "wine": "a-site", "a wine": "a-site", "hell": "a-site", "a hell": "a-site",
        "a main": "a-main", "a lobby": "a-main", "a short": "a-main",
        "short": "a-main", "a link": "a-main", "a door": "a-main", "a doors": "a-main",
        "catwalk": "a-main", "a stairs": "a-main", "a ramp": "a-main",
        # "a garden" MUST stay ahead of the bare "garden" below. Ascent has BOTH:
        # Garden sits by B, but VALORANT's own location readout says "A Garden"
        # for the vine/trellis strip directly behind A Site. zone() is
        # longest-key-wins, so the 8-char key beats the 6-char one; delete it and
        # every A Garden stand silently lands on the far side of the map.
        "a garden": "a-site",
        "b site": "b-site", "b": "b-site", "b back": "b-site", "garden": "b-site",
        "boathouse": "b-site", "b boathouse": "b-site", "switch": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b stairs": "b-main",
        "b link": "b-main", "b short": "b-main", "b ramp": "b-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid link": "mid", "mid cubby": "mid", "mid courtyard": "mid",
        "courtyard": "mid", "pizza": "mid", "tiles": "mid", "mid pizza": "mid",
        "market": "market", "market top": "market", "market bottom": "market",
        "mid market": "market",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "bind": {
        "a site": "a-site", "a": "a-site", "a heaven": "a-site", "heaven": "a-site",
        "a triple": "a-site", "triple": "a-site", "triples": "a-site",
        "a cubby": "a-site", "a back": "a-site", "a tower": "a-site",
        "a short": "a-short", "short": "a-short", "u hall": "a-short",
        "a lobby": "a-short", "a long": "a-short", "a lamps": "a-short",
        "lamps": "a-short", "a link": "a-short", "a main": "a-short",
        "showers": "showers", "shower": "showers", "a bath": "showers", "bath": "showers",
        "b site": "b-site", "b": "b-site", "b elbow": "b-site", "elbow": "b-site",
        "b window": "b-site", "window": "b-site", "b back": "b-site", "b fountain": "b-site",
        "b short": "b-short", "b long": "b-short", "b lobby": "b-short",
        "b main": "b-short", "b hall": "b-short", "b link": "b-short", "b garden": "b-short",
        "hookah": "hookah", "hooka": "hookah", "b hookah": "hookah",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "breeze": {
        "a site": "a-site", "a": "a-site", "a cave": "a-site", "cave": "a-site",
        "a bridge": "a-site", "bridge": "a-site", "a shop": "a-site",
        "a heaven": "a-site", "a back": "a-site", "a pyramid": "a-site",
        "a main": "a-main", "a hall": "a-main", "a lobby": "a-main", "a ramp": "a-main",
        "b site": "b-site", "b": "b-site", "b elbow": "b-site", "elbow": "b-site",
        "b back": "b-site", "b window": "b-site", "cannon": "b-site", "switch": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b tunnel": "b-main",
        "tunnel": "b-main", "snake": "b-main", "b hall": "b-main",
        "mid": "mid", "middle": "mid", "mid doors": "mid", "mid top": "mid",
        "mid chute": "mid", "mid pillar": "mid", "mid wood": "mid", "nest": "mid",
        "tube": "mid", "halls": "mid", "mid cubby": "mid",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "haven": {
        "a site": "a-site", "a": "a-site", "a link": "a-site", "a heaven": "a-site",
        "heaven": "a-site", "a back": "a-site", "a tower": "a-site",
        "a lobby": "a-lobby", "a long": "a-lobby", "a short": "a-lobby",
        "a main": "a-lobby", "a ramp": "a-lobby",
        "b site": "b-site", "b": "b-site", "b main": "b-site", "b back": "b-site",
        "mid": "b-site", "middle": "b-site", "mid window": "b-site",
        "mid doors": "b-site", "mid courtyard": "b-site", "courtyard": "b-site",
        "c site": "c-site", "c": "c-site", "c link": "c-site", "c cubby": "c-site",
        "c window": "c-site", "c back": "c-site", "c backsite": "c-site",
        "c lobby": "c-lobby", "c long": "c-lobby", "c main": "c-lobby", "c ramp": "c-lobby",
        "garage": "garage", "sewer": "garage", "sewers": "garage", "mid garage": "garage",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "lotus": {
        "a site": "a-site", "a": "a-site", "a link": "a-site", "a top": "a-site",
        "a drop": "a-site", "a stairs": "a-site", "a back": "a-site",
        "a main": "a-main", "a rubble": "a-main", "a lobby": "a-main", "a hall": "a-main",
        "b site": "b-site", "b": "b-site", "b link": "b-site", "b pillar": "b-site",
        "b back": "b-site", "b tree": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b hall": "b-main",
        "c site": "c-site", "c": "c-site", "c link": "c-site", "c mound": "c-site",
        "c back": "c-site",
        "c main": "c-main", "c lobby": "c-main", "c hall": "c-main",
        "c waterfall": "c-main", "waterfall": "c-main", "c tree": "c-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid link": "mid", "mid doors": "mid", "mid courtyard": "mid", "mid bend": "mid",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "split": {
        "a site": "a-site", "a": "a-site", "a rafters": "a-site", "a tower": "a-site",
        "a screens": "a-site", "a heaven": "a-site", "a back": "a-site", "a sewer": "a-site",
        "a elbow": "a-site",
        "a main": "a-main", "a ramps": "a-main", "a ramp": "a-main", "a lobby": "a-main",
        "b site": "b-site", "b": "b-site", "b rafters": "b-site", "b back": "b-site",
        "b alley": "b-site",
        "b main": "b-main", "b garage": "b-main", "b lobby": "b-main",
        "b tower": "b-main", "b heaven": "b-main", "b link": "b-main", "b stairs": "b-main",
        "mid": "mid", "middle": "mid", "mid vent": "mid", "mid bottom": "mid",
        "mid top": "mid", "mid connector": "mid",
        "mail": "mail", "mid mail": "mail", "b mail": "mail",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    # Summit's fixture has only 7 coarse zones, so the finer callouts fold in.
    # Two judgement calls worth stating, since both are areas the fixture has no
    # slot for:
    #   A Garden sits BETWEEN A Main and A Site -- the localizer's own strings say
    #     "at the A Garden mouth facing the A Main" and "A Site entrance from A
    #     Garden". It is pre-site space a defender wires to slow the approach, so
    #     it folds into a-main rather than a-site.
    #   A Link is the A-side connector to Mid; it maps to a-main to match how
    #     "a link" is already mapped on ascent, rather than inventing a new
    #     convention for one map.
    # No bare "a"/"b" keys here on purpose: this source's callouts always name the
    # site ("A Site"), and a one-letter key matches stray English prose such as
    # "a few metres out".
    "summit": {
        "a site": "a-site", "a back": "a-site", "a boxes": "a-site",
        "boxes": "a-site", "a cave": "a-site", "cave": "a-site",
        "a heaven": "a-site", "heaven": "a-site", "a temple": "a-site",
        "a cliff": "a-site", "a rock": "a-site", "a tower": "a-site",
        "a pillar": "a-site", "a default": "a-site",
        "a main": "a-main", "a lobby": "a-main", "a garden": "a-main",
        "garden": "a-main", "a link": "a-main", "a short": "a-main",
        "a entry": "a-main", "a entrance": "a-main", "a door": "a-main",
        "a doors": "a-main",
        "b site": "b-site", "b back": "b-site", "b tower": "b-site",
        "tower": "b-site", "b trophy": "b-site", "trophy": "b-site",
        "b gym": "b-site", "gym": "b-site", "b pagoda": "b-site",
        "pagoda": "b-site", "b boxes": "b-site", "b alley": "b-site",
        "b default": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b link": "b-main",
        "b short": "b-main", "b stairs": "b-main", "b entry": "b-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid bend": "mid", "bend": "mid", "mid fountain": "mid",
        "fountain": "mid", "mid courtyard": "mid", "courtyard": "mid",
        "mid window": "mid", "window": "mid", "mid archway": "mid",
        "mid arch": "mid", "mid restaurant": "mid", "restaurant": "mid",
        "cable car": "mid", "bridge": "mid",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "sunset": {
        "a site": "a-site", "a": "a-site", "a elbow": "a-site", "elbow": "a-site",
        "a alley": "a-site", "a link": "a-site", "a back": "a-site", "a heaven": "a-site",
        "a main": "a-main", "a lobby": "a-main", "a ramp": "a-main", "a stairs": "a-main",
        "b site": "b-site", "b": "b-site", "b boba": "b-site", "boba": "b-site",
        "b back": "b-site", "b link": "b-site", "b window": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b alley": "b-main", "b hall": "b-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid courtyard": "mid", "mid tiles": "mid", "mid canal": "mid",
        "market": "market", "market top": "market", "market bottom": "market",
        "mid market": "market",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
}
