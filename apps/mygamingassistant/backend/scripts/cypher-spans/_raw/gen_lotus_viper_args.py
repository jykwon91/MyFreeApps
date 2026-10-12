"""Build workflow args for Viper x Lotus, one args file per post-12.05 source.

Patch 12.05 (2026-03-17) reworked A Site / A Main when Lotus re-entered the pool, so every Lotus Viper
row filmed before it is stale. Valomate's guide was uploaded 2026-07-24 and its HUD shows client
12.10 throughout, so it postdates the rework. Each source gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_lotus_viper_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from viper_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by the app's own top-left plate ('... • ATTACKER n / 22'). "
          "Report side as attacker unless your window plainly shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by the app's own top-left plate ('... • DEFENDER n / 22'). "
           "Report side as defender unless your window plainly shows an attacking use.")

VAR_NOTE = (
    "Lotus has THREE sites (A, B, C) and a mid joined by rotating doors - use Lotus callouts (A "
    "Main, A Lobby, A Door, A Root, A Rubble, A Site, A Tree, A Hut, A Top, A Stairs, A Drop, A "
    "Heaven, A Link, Mid, C Link, B Main, B Pillars, B Site, B Upper, B Pit, C Main, C Lobby, C "
    "Mound, C Waterfall, C Door, C Site, C Bend, C Hall, C Gravel, Attacker Side Spawn, Defender "
    "Side Spawn). THE AGENT IS VIPER, so report ONLY snake-bite, poison-cloud or toxic-screen; her "
    "ultimate (Viper's Pit, a huge gas dome) is out of scope. VALORANT's location readout sits "
    "top-left, above the minimap. All footage is first-person. This footage postdates patch 12.05, "
    "which reworked A Site and A Main.")

SOURCES = {
    "lotus-valomate": {
        "video": "hpN32V33POA",
        "maxPerChapter": 2,
        "groupNote": ("Each chapter on this source is ONE lineup; a survey should normally return "
                      "exactly one placement per chapter."),
        "titleNote": ("CHAPTER TITLES NAME THE TARGET AND THE UTILITY ('<TARGET> [Defuse Denial|"
                      "Plant Denial|One-Way] <Poison Cloud|Toxic Screen|Snake Bite> NN'), never the "
                      "stand. Confirm the utility from what deploys."),
        "titleShort": "the chapter titles name the target and the utility",
        "varNoteAdd": ("The client is JAPANESE: the location readout is katakana ('アタック側 "
                       "スポーン' = Attacker Side Spawn) -- report the English callout. The app "
                       "draws a plate top-left ('POISON CLOUD • ATTACKER 2 / 22') and a static "
                       "VALOMATE map inset top-right with pins and a stand-to-target line; both are "
                       "overlays, never events. 30fps source."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata;
        # side read from each chapter's plate (plates 1-13 ATTACKER, 14-22 DEFENDER).
        # Dropped: 1 `Intro` (0-3).
        "chapters": [
            (2, 3, 22, "A Main Poison Cloud 01", "poison-cloud", ATTACK),
            (3, 22, 42, "A Site Poison Cloud 01", "poison-cloud", ATTACK),
            (4, 42, 62, "A Stairs Poison Cloud 02", "poison-cloud", ATTACK),
            (5, 62, 87, "A Stairway Poison Cloud 01", "poison-cloud", ATTACK),
            (6, 87, 110, "A Top Poison Cloud 01", "poison-cloud", ATTACK),
            (7, 110, 127, "C Site Defuse Denial Poison Cloud", "poison-cloud", ATTACK),
            (8, 127, 154, "A Main Toxic Screen 01", "toxic-screen", ATTACK),
            (9, 154, 175, "A Main Toxic Screen 02", "toxic-screen", ATTACK),
            (10, 175, 196, "C Site Toxic Screen 01", "toxic-screen", ATTACK),
            (11, 196, 213, "A Site Defuse Denial Snake Bite 01", "snake-bite", ATTACK),
            (12, 213, 232, "A Site Defuse Denial Snake Bite 02", "snake-bite", ATTACK),
            (13, 232, 252, "B Site Defuse Denial Snake Bite 01", "snake-bite", ATTACK),
            (14, 252, 275, "C Site Defuse Denial Snake Bite 01", "snake-bite", ATTACK),
            (15, 275, 300, "A Tree One-Way Poison Cloud", "poison-cloud", DEFENSE),
            (16, 300, 321, "C Main One-Way Poison Cloud 01", "poison-cloud", DEFENSE),
            (17, 321, 343, "C Main One-Way Poison Cloud 02", "poison-cloud", DEFENSE),
            (18, 343, 363, "C Main Poison Cloud 01", "poison-cloud", DEFENSE),
            (19, 363, 387, "A/B Toxic Screen 01", "toxic-screen", DEFENSE),
            (20, 387, 410, "A/B Toxic Screen 02", "toxic-screen", DEFENSE),
            (21, 410, 432, "A/B Toxic Screen 03", "toxic-screen", DEFENSE),
            (22, 432, 456, "A Route Snake Bite 01", "snake-bite", DEFENSE),
            (23, 456, 484, "C Site Plant Denial Snake Bite 01", "snake-bite", DEFENSE),
        ],
    },
}


def main():
    stem = sys.argv[1]
    src = SOURCES[stem]
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "lotus", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in src["chapters"]]

    args = {
        "map": "lotus", "video": src["video"],
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_VIPER_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": ABILITIES,
        "varNote": VAR_NOTE + " " + src["varNoteAdd"],
        "items": items,
    }
    out = os.path.join(HERE, "lotus_viper_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
