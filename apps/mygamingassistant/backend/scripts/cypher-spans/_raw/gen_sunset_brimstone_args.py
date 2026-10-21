"""Build workflow args for Brimstone x Sunset, one args file per post-9.08 source.

The first Brimstone batch. Each source below postdates patch 9.08 (Oct 2024, which reworked B
Main, B site and Mid Courtyard) and gets its own pack stem, because ingest_agent joins on
youtube_video_id.

  python gen_sunset_brimstone_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from brimstone_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

POSTPLANT = ("This lineup is ATTACKER-side by the source's own framing: a post-plant molly thrown "
             "from an attacker position onto the plant spot. Confirm from the footage (spike "
             "carried / planted on the target in the RESULT shot) and report side as attacker "
             "unless your window plainly contradicts it.")
RETAKE = ("This lineup is thrown 'from CT' -- DEFENDER-side: a retake molly thrown from defender "
          "side onto a planted spike. Confirm from the footage (spike planted on the target in "
          "the RESULT shot) and report side as defender unless your window plainly contradicts "
          "it.")

VAR_NOTE = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "THE AGENT IS BRIMSTONE, so report ONLY brim-incendiary (the grenade-launcher molly); Sky "
    "Smoke, Stim Beacon and his ultimate (Orbital Strike) are out of scope. VALORANT's location "
    "readout sits top-left, above the minimap ('B Lobby' observed). Sunset has green "
    "diamond-lattice backlit glass crates and doors; they are map geometry, not utility. All "
    "aim and fire footage is first-person.")

SOURCES = {
    "sunset-hehexd": {
        "video": "Aj9czhyt7Tc",
        "maxPerChapter": 2,
        "groupNote": ("Each chapter on this source is ONE lineup; a survey should normally return "
                      "exactly one placement per chapter."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<TARGET plant "
                      "spot> from <STAND>'. Call the ability from what deploys."),
        "titleShort": "the chapter titles on this source name no ability",
        "varNoteAdd": ("A custom game. A caption top-right names the target and a difficulty "
                       "('B DEFAULT / LEVEL: EASY'). The editor ZOOMS IN on the crosshair and "
                       "draws a RED CIRCLE on the alignment point; after the fire it cuts to a "
                       "FOLLOW-CAM chasing the grenade with a white STOPWATCH box bottom-left, then "
                       "a ground-level RESULT angle, then a 2x2 POSITION/SHOWCASE/REFERENCE/RESULT "
                       "recap grid. All are EDITOR shots/overlays, never events; never pin an "
                       "event inside the recap grid."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Intro (0, 0-24) and Outro (25, 799-811) dropped.
        "chapters": [
            (1, 24, 64, "B Default from B Lobby", "brim-incendiary", POSTPLANT),
            (2, 64, 94, "B Default from Mid Bottom", "brim-incendiary", POSTPLANT),
            (3, 94, 121, "B Default from B Market", "brim-incendiary", POSTPLANT),
            (4, 121, 160, "B Default from CT", "brim-incendiary", RETAKE),
            (5, 160, 197, "B Stairs from B Lobby", "brim-incendiary", POSTPLANT),
            (6, 197, 231, "B Side Plant from Mid Bottom", "brim-incendiary", POSTPLANT),
            (7, 231, 265, "B Side Plant from CT", "brim-incendiary", RETAKE),
            (8, 265, 301, "B Backsite from Mid Bottom", "brim-incendiary", POSTPLANT),
            (9, 301, 329, "B Backsite from CT", "brim-incendiary", RETAKE),
            (10, 329, 370, "A Default from A Elbow", "brim-incendiary", POSTPLANT),
            (11, 370, 400, "A Default from A Lobby", "brim-incendiary", POSTPLANT),
            (12, 400, 427, "A Default from Tiles", "brim-incendiary", POSTPLANT),
            (13, 427, 449, "A Default from A Link", "brim-incendiary", POSTPLANT),
            (14, 449, 480, "A Default from CT", "brim-incendiary", RETAKE),
            (15, 480, 514, "A Open1 from A Elbow", "brim-incendiary", POSTPLANT),
            (16, 514, 543, "A Open1 from A Lobby", "brim-incendiary", POSTPLANT),
            (17, 543, 570, "A Open1 from CT", "brim-incendiary", RETAKE),
            (18, 570, 607, "A Open2 from A Lobby", "brim-incendiary", POSTPLANT),
            (19, 607, 641, "A Open2 from CT", "brim-incendiary", RETAKE),
            (20, 641, 672, "A Safe from A Elbow", "brim-incendiary", POSTPLANT),
            (21, 672, 698, "A Safe from A Link", "brim-incendiary", POSTPLANT),
            (22, 698, 735, "A Open3 from A Elbow", "brim-incendiary", POSTPLANT),
            (23, 735, 768, "A Open3 from A Lobby", "brim-incendiary", POSTPLANT),
            (24, 768, 799, "A Open3 from CT", "brim-incendiary", RETAKE),
        ],
    },
}


def main():
    stem = sys.argv[1]
    src = SOURCES[stem]
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "sunset", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in src["chapters"]]

    args = {
        "map": "sunset", "video": src["video"],
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_BRIMSTONE_%s.md" % stem.upper()),
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
    out = os.path.join(HERE, "sunset_brimstone_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
