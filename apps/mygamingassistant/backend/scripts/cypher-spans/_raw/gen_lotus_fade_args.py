"""Build workflow args for Fade x Lotus, one args file per post-12.05 source.

Patch 12.05 (2026-03-17) reworked A Site / A Main when Lotus re-entered the pool, so every Lotus Fade
row filmed before it is stale. Each source below postdates 12.05 and gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_lotus_fade_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from fade_phoenix_abilities import FADE

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by the source's own on-screen plate (ATTACK). Report side "
          "as attacker unless your window plainly shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by the source's own on-screen plate (DEFENSE). Report "
           "side as defender unless your window plainly shows an attacking use.")
ONE_PER_CHAPTER = ("Each chapter on this source is ONE lineup; a survey should normally return "
                   "exactly one placement per chapter.")

CALLOUTS = (
    "Lotus has THREE sites (A, B, C) and a mid joined by rotating doors - use Lotus callouts (A "
    "Main, A Lobby, A Door, A Root, A Rubble, A Site, A Tree, A Hut, A Top, A Stairs, A Drop, A "
    "Heaven, A Link, Mid, C Link, B Main, B Pillars, B Site, B Upper, B Pit, C Main, C Lobby, C "
    "Mound, C Waterfall, C Door, C Site, C Bend, C Hall, C Gravel, Attacker Side Spawn, Defender "
    "Side Spawn). VALORANT's location readout sits top-left, above the minimap. All footage is "
    "first-person. This footage postdates patch 12.05, which reworked A Site and A Main.")
FADE_NOTE = ("THE AGENT IS FADE, so report ONLY haunt or seize; Prowler (a steered creature) and "
             "Nightfall (her ultimate wave) are out of scope.")

SOURCES = {
    "lotus-yolzy": {
        "video": "noBoH0o5vRY", "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '[qualifier] "
                      "<TARGET> [Reveal|Push|Retake] [From <STAND>]', some as hype text. Call the "
                      "ability from what deploys."),
        "titleShort": "the chapter titles on this source name no ability",
        "varNoteAdd": ("Each chapter OPENS on a HUD-OFF overview of the DESTINATION under a "
                       "bottom-left plate ('A MAIN PUSH' / 'DEFENSE') -- a PREVIEW, never the "
                       "stand or the landing. Some chapters are filmed in a live round with a "
                       "'BUY PHASE' banner -- game UI, never an event. 2160p60 source."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 1 `The Best Fade Lineups On Lotus` (0-7, intro), 18 `ATTACK` (326-329, section
        # header) and 27 `GAMEPLAY` (520-556, round footage). Chapters 2-17 carry the DEFENSE plate,
        # 19-26 the ATTACK plate.
        "chapters": [
            (2, 7, 23, "Fast A Main Push", "haunt", DEFENSE),
            (3, 23, 41, "A Main From Tree (ORB SPAM)", "haunt", DEFENSE),
            (4, 41, 64, "Fast Landing A Main Reveal", "haunt", DEFENSE),
            (5, 64, 86, "A Site Retake", "haunt", DEFENSE),
            (6, 86, 106, "Insane A site Retake Reveal", "haunt", DEFENSE),
            (7, 106, 118, "A Main Reveal (SMOKE SPAM)", "haunt", DEFENSE),
            (8, 118, 139, "B Site Support/Retake", "haunt", DEFENSE),
            (9, 139, 159, "A Main From B site", "haunt", DEFENSE),
            (10, 159, 178, "C Main Reveal From B Site", "haunt", DEFENSE),
            (11, 178, 197, "C Site Retake Reveal", "haunt", DEFENSE),
            (12, 197, 218, "Insane C Main Control Reveal", "haunt", DEFENSE),
            (13, 218, 253, "GOD Reveal From the Whole C site", "haunt", DEFENSE),
            (14, 253, 270, "BEST Retake C Reveal (risky)", "haunt", DEFENSE),
            (15, 270, 291, "C Site Retake (if C Hall Is Smoked Off)", "haunt", DEFENSE),
            (16, 291, 308, "C Main Reveal", "haunt", DEFENSE),
            (17, 308, 326, "Early C Main Info", "haunt", DEFENSE),
            (19, 329, 351, "A Main God Reveal", "haunt", ATTACK),
            (20, 351, 374, "A Site Reveal", "haunt", ATTACK),
            (21, 374, 398, "A Tree", "haunt", ATTACK),
            (22, 398, 423, "God A Site Reveal From Tree", "haunt", ATTACK),
            (23, 423, 441, "Simple A Backsite", "haunt", ATTACK),
            (24, 441, 472, "Post-plant A Tree Smoke Spam", "haunt", ATTACK),
            (25, 472, 498, "C Long Reveal", "haunt", ATTACK),
            (26, 498, 520, "Simple Post-plant Reveal", "haunt", ATTACK),
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
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_FADE_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": FADE,
        "varNote": " ".join((CALLOUTS, FADE_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "lotus_fade_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
