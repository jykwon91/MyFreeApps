"""Build workflow args for Killjoy x Abyss (Briiest, o1_qZPhJjRs).

Abyss had zero Killjoy coverage. This is the only Killjoy Abyss guide uploaded AFTER patch
11.08 reworked B Site and the Mid hallway into B Main (2025-11-27 vs 2025-10-15), so nothing
here needs the `held` override the June-2024 Abyss sources did.

Two things make this source different from every Cypher run, and both are encoded below rather
than left to the agents to work out:

  1. NO CHAPTER TITLE NAMES AN ABILITY. The titles are `<Kind> <Area>` -- `Setups A-Site`,
     `Postplant Lineups B-Site`. Every other source this pipeline has ingested put the ability
     in the title and used the footage only to CONFIRM it. Here the footage is the sole source,
     so `ability` on each item is a FALLBACK used only if the survey fails to call one, and the
     abilities table is passed explicitly so the survey knows what it is choosing between.

  2. ALL THREE Killjoy abilities appear, mixed freely inside a single chapter, and a single
     burned-in caption routinely covers several of them at once ("Put your Alarmbot on this spot
     and one Nanoswarm on the right and one behind your Bot" = three placements, two abilities).
     A caption is therefore a chapter-level plan, not a per-placement label.

Chapters that are NOT placements are excluded by name:
  - `Intro` is obvious.
  - `Killjoy Ultimate Spots` is out of scope by design -- no ultimate abilities are seeded for
    ANY of the 27 agents, so an ult chapter has no utility_type to ingest against.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_ABYSS.md")
VIDEO = "o1_qZPhJjRs"

# (index, start, end, title) straight from scripts/dump_chapters.py.
CHAPTERS = [
    (1, 16, 128, "Setups A-Site"),
    (2, 128, 265, "Setups B-Site"),
    (3, 265, 380, "Postplant Lineups A-Site"),
    (4, 380, 465, "Postplant Lineups B-Site"),
    (5, 465, 590, "Initiator Lineups B-Site"),
    (6, 590, 647, "Initiator Lineups Mid"),
]

# Killjoy's lineup-able abilities. `placement` here mirrors app/fixtures/utility_types.json --
# turret and alarmbot are `placed` (3 beats, no THROW), nanoswarm is not (4 beats). ingest_agent
# re-reads that from the DB and rejects a placed row carrying a throw, so these must agree.
ABILITIES = {
    "turret": {
        "survey": "a three-legged sentry robot standing deployed on its tripod, eye lit and "
                  "sweeping = turret",
        "landing": "the turret DEPLOYED -- opaque, standing on its tripod with its legs planted "
                   "and its eye lit, and it STAYS PUT when the view moves off it. The green/teal "
                   "translucent placement hologram that tracks the crosshair is the AIM, never "
                   "the LANDING (a hologram in the LANDING strip = FAIL).",
    },
    "alarmbot": {
        "survey": "a squat wheeled bot with a single lit eye, sitting on the ground = alarmbot",
        "landing": "the alarmbot DEPLOYED -- settled on the ground on its wheels, upright and its "
                   "eye lit, not still in hand and not merely aimed at the spot.",
    },
    "nanoswarm": {
        "survey": "a small canister THROWN in an arc that settles on the ground and then goes "
                  "covert (near-invisible) = nanoswarm",
        "landing": "the nanoswarm SETTLED at its destination -- the last motion of the canister "
                   "as it comes to rest, immediately before it goes covert. The gas cloud is the "
                   "ACTIVATION, a separate deliberate act often seconds later and after a cut -- "
                   "a cloud in the LANDING strip = FAIL.",
        "release": "the canister actually LEAVES THE HAND into its arc -- a held canister with "
                   "NO release = FAIL. Note Killjoy's EQUIP flourish flips the device up and "
                   "catches it; that is not a release.",
    },
}

VAR_NOTE = (
    "Abyss is a NEWER map with a vertical, bridge-and-void layout - do not pattern-match callouts "
    "from older maps, and note that A Lobby / B Lobby are SEPARATE zones from A Main / B Main "
    "here. Call the ability from what is deployed on screen; the chapter titles on this source "
    "name NO ability at all. This creator DOES burn a caption onto most placements and those "
    "captions name abilities and destinations - quote them - but one caption frequently covers "
    "SEVERAL placements of DIFFERENT abilities, so it is a chapter-level plan, not a label for "
    "one placement. The HUD binds C = nanoswarm (grenade icon, two charge pips), Q = alarmbot "
    "(the '!?' bot), E = turret, X = Lockdown (padlock dome) - verified on full-res crops at 20s "
    "and 478s. THE AGENT IS KILLJOY IN EVERY CHAPTER: the scoreboard portrait and that ability "
    "bar are identical from 16s to 647s, so never re-identify the agent, and report ONLY turret, "
    "alarmbot or nanoswarm - no other ability slug is valid on this source. A deployed nanoswarm "
    "in range shows an 'F DETONATE' prompt that neither placed device does. The bright green "
    "outlined quadrilateral on the ground at A Site and B Site is VALORANT's own spike plant-zone "
    "boundary (the creator carries the Spike) - it is map geometry, present unchanged before and "
    "after every placement, and is NOT a drawn marker and NOT your utility. The minimap is "
    "fixed-orientation and does not rotate. All footage is first-person; Killjoy has no remote "
    "view, so there is no camera-view cutaway to avoid.")

# Side is not guessable from the footage alone on a source filmed alone on a custom server, and
# it is not in the titles' ability slot either -- it is in their KIND half. Stated per chapter.
DEFENDER_NOTE = (
    "This chapter is a DEFENDER setups section by its own title ('Setups'): devices placed on a "
    "site to hold it. Report side as defender unless your own window plainly contradicts it.")
ATTACKER_POSTPLANT = (
    "This chapter is ATTACKER-side: a postplant only exists once your own team has planted, and "
    "these are lineups thrown to cover the planted spike. Report side as attacker.")
ATTACKER_INITIATOR = (
    "This chapter is ATTACKER-side: these are lineups thrown from outside a space to clear it "
    "before entering. Report side as attacker.")

SIDE_NOTE = {
    "Setups A-Site": DEFENDER_NOTE,
    "Setups B-Site": DEFENDER_NOTE,
    "Postplant Lineups A-Site": ATTACKER_POSTPLANT,
    "Postplant Lineups B-Site": ATTACKER_POSTPLANT,
    "Initiator Lineups B-Site": ATTACKER_INITIATOR,
    "Initiator Lineups Mid": ATTACKER_INITIATOR,
}


def fallback_ability(title):
    """Ability used ONLY if the survey returns none for a placement.

    Not a guess dressed up as a default: a `... Lineups` chapter is thrown utility at range,
    which for Killjoy can only be the nanoswarm (neither placed device can be deployed across a
    site). A `Setups` chapter genuinely mixes all three, so the fallback there is a placed one --
    getting the CLASS right (3 beats, no THROW) matters more than which placed device it names,
    and the localizer is told to correct the name from the footage.
    """
    t = title.lower()
    if "lineup" in t:
        return "nanoswarm"
    if "setup" in t:
        return "turret"
    raise SystemExit(f"ABORT - no fallback ability for chapter title {title!r}; extend "
                     f"fallback_ability() rather than defaulting, or a whole chapter ships "
                     f"under a guess.")


def main():
    items = []
    for idx, s, e, title in CHAPTERS:
        note = SIDE_NOTE.get(title)
        if note is None:
            raise SystemExit(f"ABORT - no side note for chapter {title!r}. Every chapter must "
                             f"state its side explicitly; this source is mixed-side.")
        items.append({
            "nn": "%02d" % idx, "cs": s, "next": e,
            "ability": fallback_ability(title), "name": title, "map": "abyss",
            "varNoteAdd": note,
        })

    args = {
        "map": "abyss", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # The setup chapters run 112s and 137s and place three devices per caption. The first run
        # used 12 and BOTH setup chapters came back at exactly 12: chapter 01's survey said it
        # dropped a placement to fit, and chapter 02 reported one nanoswarm for three captions
        # that each name two. Hitting a cap exactly is truncation, the silent-drop failure the
        # survey stage exists to prevent, so the cap now sits well clear of the observed count.
        "maxPerChapter": 20,
        "captions": True,
        "captionExamples": ('"Put your Turret in this corner to distract the enemies", "Put your '
                            'first Nanoswarm on the Boxes and the second one left of the Boxes", '
                            '"This lineup clears the area backside Generator"'),
        "groupNote": ("This source groups several separate placements into ONE chapter, and mixes "
                      "ABILITIES within a chapter (a single setup places a turret, an alarmbot "
                      "and two nanoswarms in sequence)."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY AT ALL -- they are "
                      "'<Kind> <Area>', e.g. 'Setups A-Site', 'Postplant Lineups B-Site'. There "
                      "is no title-derived ability to fall back on, so call every ability from "
                      "what is actually deployed. The burned-in caption often names abilities, "
                      "but one caption regularly covers several placements of different "
                      "abilities -- use it as context, not as a per-placement label."),
        "titleShort": "the chapter titles on this source name no ability at all",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "abyss_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, _ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   abilities offered to the survey:", ", ".join(ABILITIES))
    print("   fallbacks:", {i["nn"]: i["ability"] for i in items})
    print("   sides:", {i["nn"]: ("defender" if "defender" in i["varNoteAdd"] else "attacker")
                        for i in items})


main()
