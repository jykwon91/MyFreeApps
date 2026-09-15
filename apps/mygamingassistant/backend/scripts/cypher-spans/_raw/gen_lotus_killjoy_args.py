"""Build workflow args for Killjoy x Lotus (Briiest, liSWxxXao-I).

Lotus had zero Killjoy coverage. Patch 12.05 (2026-03-17) reworked A Site / A Long when Lotus
re-entered the pool; this guide was uploaded 2026-04-30, AFTER that rework, so its A-site rows need
no `held` override. Older Lotus Killjoy guides (Chiru 2024-06, Reco 2024-01) predate the rework and
may only contribute B and C spots.

Same creator and same layout as the Abyss run (gen_abyss_killjoy_args.py): burned-in captions,
mixed abilities inside `Setups` chapters, titles that mostly name no ability. Two differences:

  1. Three `Turrets <Site>` chapters DO name the ability -- each is a run of turret placements, so
     the fallback there is exact rather than a class-level guess.
  2. The postplant chapters draw a red circle on the throw-button prompt to mark which click to
     throw with (seen at 525s). That is an editor overlay, never an event.

Excluded by name: `Intro`, and `Killjoy Ultimate Spots` (no ultimate is seeded as a utility_type).
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_LOTUS.md")
VIDEO = "liSWxxXao-I"

# (index, start, end, title) from yt-dlp's chapter metadata.
CHAPTERS = [
    (1, 16, 59, "Turrets A-Site"),
    (2, 59, 95, "Turrets B-Site"),
    (3, 95, 123, "Turrets C-Site"),
    (4, 123, 242, "Setups A-Site"),
    (5, 242, 304, "Setups B-Site"),
    (6, 304, 391, "Setups C-Site"),
    (7, 391, 450, "Postplant Lineups A-Site"),
    (8, 450, 510, "Postplant Lineups B-Site"),
    (9, 510, 542, "Postplant Lineups C-Site"),
    (10, 542, 571, "Initiator Lineups A-Site"),
    (11, 571, 630, "Initiator Lineups C-Site"),
]

VAR_NOTE = (
    "Lotus has THREE sites (A, B, C), rotating stone doors and a mid - use Lotus callouts (A Main, "
    "A Rubble, A Root, A Door, A Link, A Site, A Tree, A Stairs, A Top, A Drop, A Hut, B Main, "
    "B Pillars, B Site, B Upper, C Main, C Mound, C Waterfall, C Door, C Link, C Site, C Bend, "
    "C Hall, C Gravel, Attacker Side Spawn, Defender Side Spawn). Call the ability from what is "
    "deployed on screen: only the three 'Turrets' chapters name an ability in their title. This "
    "creator burns a CAPTION onto most placements in a large serif font across the lower third "
    "('This Turret gives info for Tree and Stairs', 'Another Turret for Main info') - quote them - "
    "but one caption can cover SEVERAL placements, so it is a chapter-level plan, not a label for "
    "one placement. The HUD binds C = nanoswarm, Q = alarmbot, E = turret, X = Lockdown (padlock "
    "dome) - verified on full-res crops at 30s, 160s and 480s. THE AGENT IS KILLJOY IN EVERY "
    "CHAPTER, so report ONLY turret, alarmbot or nanoswarm. A held nanoswarm (a small canister "
    "with an orange domed top) puts a two-mouse-button throw prompt above the C slot; on the "
    "postplant chapters the editor draws a RED CIRCLE around one of those buttons to mark which "
    "click to throw with - an overlay, never an event. A deployed turret or alarmbot shows a "
    "recall prompt above its own slot. The turret placement preview is a PINK hologram over a cyan "
    "ring - the AIM, never the LANDING. An ACTIVATED nanoswarm is a pink/purple dome with a cyan "
    "rim; that is the activation, not the landing. The thin cyan lines drawn flat on the ground at "
    "each site are VALORANT's own spike plant-zone boundary (the creator carries the Spike) - map "
    "geometry, not a marker and not utility, and carrying the Spike does NOT make a chapter "
    "attacker-side. VALORANT's location readout sits top-left above the minimap and is on. The "
    "minimap is fixed-orientation. All footage is first-person.")

DEFENDER_NOTE = (
    "This chapter is DEFENDER-side by its own title ('Turrets' / 'Setups'): devices placed on a "
    "site to hold it. Report side as defender unless your own window plainly contradicts it.")
ATTACKER_POSTPLANT = (
    "This chapter is ATTACKER-side: a postplant only exists once your own team has planted, and "
    "these are lineups thrown to cover the planted spike. Report side as attacker.")
ATTACKER_INITIATOR = (
    "This chapter is ATTACKER-side: these are lineups thrown from outside a space to clear it "
    "before entering. Report side as attacker.")


def side_note(title):
    if title.startswith(("Turrets ", "Setups ")):
        return DEFENDER_NOTE
    if title.startswith("Postplant "):
        return ATTACKER_POSTPLANT
    if title.startswith("Initiator "):
        return ATTACKER_INITIATOR
    raise SystemExit(f"ABORT - no side note for chapter {title!r}; this source is mixed-side.")


def fallback_ability(title):
    """Ability used ONLY if the survey returns none for a placement (see the Abyss generator)."""
    if title.startswith("Turrets "):
        return "turret"
    if "Lineups" in title:
        return "nanoswarm"
    if title.startswith("Setups "):
        return "turret"
    raise SystemExit(f"ABORT - no fallback ability for chapter title {title!r}.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": fallback_ability(title),
        "name": title, "map": "lotus", "varNoteAdd": side_note(title),
    } for idx, s, e, title in CHAPTERS]

    args = {
        "map": "lotus", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # Abyss from this creator needed 20 after a cap-12 run truncated both setup chapters.
        # Setups A-Site here runs 119s, longer than either Abyss setup chapter.
        "maxPerChapter": 20,
        "captions": True,
        "captionExamples": ('"This Turret gives info for Tree and Stairs", "Another Turret for '
                            'Main info"'),
        "groupNote": ("This source groups several separate placements into ONE chapter. The "
                      "'Turrets' chapters are runs of turret placements; the 'Setups' chapters mix "
                      "ABILITIES (a setup places a turret, an alarmbot and nanoswarms in "
                      "sequence); the 'Lineups' chapters are runs of nanoswarm throws."),
        "titleNote": ("MOST CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they are '<Kind> "
                      "<Area>', e.g. 'Setups A-Site', 'Postplant Lineups B-Site'. Only the "
                      "'Turrets <Site>' chapters name one. Call every ability from what is "
                      "actually deployed; use the burned-in caption as context, not as a "
                      "per-placement label."),
        "titleShort": "the chapter titles on this source mostly name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "lotus_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, _ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   fallbacks:", {i["nn"]: i["ability"] for i in items})
    print("   sides:", {i["nn"]: ("defender" if "DEFENDER" in i["varNoteAdd"] else "attacker")
                        for i in items})


main()
