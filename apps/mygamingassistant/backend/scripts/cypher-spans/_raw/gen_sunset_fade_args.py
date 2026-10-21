"""Build workflow args for Fade x Sunset, one args file per post-9.08 source.

Patch 9.08 (Oct 2024) reworked B Main, B site and Mid Courtyard, so every Sunset Fade row filmed
before it is stale. Each source below postdates 9.08 and gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_sunset_fade_args.py <stem>     (one of the SOURCES keys)
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
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "Market is its own zone, and A Link is part of A Site on Sunset (not mid). VALORANT's location "
    "readout sits top-left, above the minimap ('A Lobby', 'A Main' observed). Sunset has green "
    "diamond-lattice backlit glass crates and doors; they are map geometry, not utility. All "
    "footage is first-person. This footage postdates patch 9.08, which reworked B Main, B site "
    "and Mid Courtyard.")
FADE_NOTE = ("THE AGENT IS FADE, so report ONLY haunt or seize; Prowler (a steered creature) and "
             "Nightfall (her ultimate wave) are out of scope.")

SOURCES = {
    "sunset-yolzy": {
        "video": "ftRFbSVJg3s", "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE MOSTLY NAME NO ABILITY -- they read "
                      "'[qualifier] <TARGET> [Reveal|Retake|Hold|Default|Info] [From <STAND>]'; "
                      "only the '*Seize' titles name one. 'CT' = Defender Side Spawn; 'A Site Gen' "
                      "= a generator prop on A Site. Call the ability from what deploys."),
        "titleShort": "the chapter titles on this source mostly name no ability",
        "varNoteAdd": ("Each chapter OPENS on a HUD-OFF overview of the DESTINATION under a "
                       "bottom-left plate (lineup name over 'ATTACK' / 'DEFENSE') -- a PREVIEW, "
                       "never the stand or the landing. The minimap ROTATES with the player. "
                       "Custom game on client 13.00. 2160p60 source."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 0 intro (0-7) and 6 `Defender Fade Lineups` (113-117, section header).
        # Chapters 1-5 carry the ATTACK plate, 7-18 the DEFENSE plate.
        "chapters": [
            (1, 7, 28, "Fast A Elbow Reveal", "haunt", ATTACK),
            (2, 28, 50, "A Site Reveal", "haunt", ATTACK),
            (3, 50, 67, "A Site Gen *Seize", "seize", ATTACK),
            (4, 67, 92, "Insane A Site Reveal From Elbow", "haunt", ATTACK),
            (5, 92, 113, "GOD Mid Reveal", "haunt", ATTACK),
            (7, 117, 139, "A Main Reveal", "haunt", DEFENSE),
            (8, 139, 155, "A Main *Seize", "seize", DEFENSE),
            (9, 155, 179, "A Site Retake Reveal", "haunt", DEFENSE),
            (10, 179, 195, "A Site Default *Seize", "seize", DEFENSE),
            (11, 195, 223, "A Site Reveal For Team Support", "haunt", DEFENSE),
            (12, 223, 246, "Early Mid Info", "haunt", DEFENSE),
            (13, 246, 265, "Mid Reveal", "haunt", DEFENSE),
            (14, 265, 289, "Mid Reveal 2.0", "haunt", DEFENSE),
            (15, 289, 315, "B Site Hold Reveal", "haunt", DEFENSE),
            (16, 315, 335, "B Site Reveal (Easy Smoke Spam Kills)", "haunt", DEFENSE),
            (17, 335, 357, "B Site Retake Reveal From Market", "haunt", DEFENSE),
            (18, 357, 392, "B Site Retake Reveal From CT", "haunt", DEFENSE),
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
    out = os.path.join(HERE, "sunset_fade_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
