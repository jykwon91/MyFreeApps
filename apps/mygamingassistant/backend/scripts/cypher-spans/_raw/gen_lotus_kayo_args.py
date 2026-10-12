"""Build workflow args for KAY/O x Lotus, one args file per post-12.05 source.

Patch 12.05 (2026-03-17) reworked A Site / A Main when Lotus re-entered the pool, so every Lotus KAY/O
row filmed before it is stale. Each source below postdates 12.05 and gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_lotus_kayo_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from kayo_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by the source's own labelling (the video's `Attack` "
          "section). Report side as attacker unless your window plainly shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by the source's own labelling (the video's second half, "
           "after the attack lineups, where the minimap orientation flips). Report side as "
           "defender unless your window plainly shows an attacking use.")
ONE_PER_CHAPTER = ("Each chapter on this source is ONE lineup; a survey should normally return "
                   "exactly one placement per chapter.")

CALLOUTS = (
    "Lotus has THREE sites (A, B, C) and a mid joined by rotating doors - use Lotus callouts (A "
    "Main, A Lobby, A Door, A Root, A Rubble, A Site, A Tree, A Hut, A Top, A Stairs, A Drop, A "
    "Heaven, A Link, Mid, C Link, B Main, B Pillars, B Site, B Upper, B Pit, C Main, C Lobby, C "
    "Mound, C Waterfall, C Door, C Site, C Bend, C Hall, C Gravel, Attacker Side Spawn, Defender "
    "Side Spawn). VALORANT's location readout sits top-left, above the minimap. All footage is "
    "first-person. This footage postdates patch 12.05, which reworked A Site and A Main.")
KAYO_NOTE = ("THE AGENT IS KAY/O, so report ONLY zero-point (the suppression blade), flashdrive "
             "(the flash grenade) or fragment (the hex frag); NULL/cmd (his ultimate) is out of "
             "scope. KAY/O has no charge: report CHARGE none.")

SOURCES = {
    "lotus-maxwell": {
        "video": "wJ7FwDO9VkA",
        "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES READ '<STAND> to <TARGET> [No.2]' and name no ability; the "
                      "video's chapter list groups them under ZERO/point, FLASH/drive and "
                      "FRAG/ment headers, which is the fallback ability. Confirm the ability from "
                      "what deploys."),
        "titleShort": "the chapter titles name stand and target; the ability comes from the group",
        "varNoteAdd": ("A bottom-left two-line plate ('From A-Rubble' / 'To A-Main') repeats the "
                       "title - an editor overlay, never an event. The creator often scopes an "
                       "OPERATOR onto the aim reference with a small red circle drawn around it; "
                       "that zoom is a demonstration, the AIM is the ability held on that "
                       "reference. Large burned-in captions are editor text. 24fps source: one "
                       "frame is ~42ms."),
        # (index, start, end, title, group ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 1 `Attack` (0-5, section header). Chapters 2-16 are the attack half and 17-31
        # follow the `Defense,` header in the description's chapter list.
        "chapters": [
            (2, 5, 29, "A Root to A Tree", "zero-point", ATTACK),
            (3, 29, 49, "A Main to A Backsite", "zero-point", ATTACK),
            (4, 49, 76, "B Main to B Site", "zero-point", ATTACK),
            (5, 76, 105, "C Lobby to C Mound", "zero-point", ATTACK),
            (6, 105, 126, "A Lobby to A Main", "flashdrive", ATTACK),
            (7, 126, 145, "A Rubble to A Main", "flashdrive", ATTACK),
            (8, 145, 164, "A Site to A Heaven", "flashdrive", ATTACK),
            (9, 164, 180, "B Main to B Site", "flashdrive", ATTACK),
            (10, 180, 201, "C Lobby to C Mound", "flashdrive", ATTACK),
            (11, 201, 222, "C Entrance to C Backsite", "flashdrive", ATTACK),
            (12, 222, 244, "A Main to A Default", "fragment", ATTACK),
            (13, 244, 264, "A Main to A Default No.2", "fragment", ATTACK),
            (14, 264, 278, "Tree to A Default", "fragment", ATTACK),
            (15, 278, 303, "B Lobby to B Pit", "fragment", ATTACK),
            (16, 303, 320, "C Site to Waterfall", "fragment", ATTACK),
            (17, 320, 352, "A Heaven to C Mound", "zero-point", DEFENSE),
            (18, 352, 380, "A Site to C Entrance", "zero-point", DEFENSE),
            (19, 380, 402, "C Entrance to A Rubble", "zero-point", DEFENSE),
            (20, 402, 426, "C Entrance to A Main", "zero-point", DEFENSE),
            (21, 426, 452, "C Site to B Main", "zero-point", DEFENSE),
            (22, 452, 471, "A Main to A Root", "flashdrive", DEFENSE),
            (23, 471, 493, "A Main to A Root No.2", "flashdrive", DEFENSE),
            (24, 493, 519, "A Backsite to A Tree", "flashdrive", DEFENSE),
            (25, 519, 539, "A Link to B Site", "flashdrive", DEFENSE),
            (26, 539, 562, "B Upper to B Site", "flashdrive", DEFENSE),
            (27, 562, 590, "C Entrance to C Lobby", "flashdrive", DEFENSE),
            (28, 590, 608, "Waterfall to C Mound", "flashdrive", DEFENSE),
            (29, 608, 628, "A Main to A Root", "fragment", DEFENSE),
            (30, 628, 645, "A Heaven to A Pit", "fragment", DEFENSE),
            (31, 645, 680, "C Hall to C Bend", "fragment", DEFENSE),
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
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_KAYO_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": ABILITIES,
        "varNote": " ".join((CALLOUTS, KAYO_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "lotus_kayo_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
