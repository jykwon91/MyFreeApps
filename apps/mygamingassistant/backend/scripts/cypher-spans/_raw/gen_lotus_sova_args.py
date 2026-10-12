"""Build workflow args for Sova x Lotus, one args file per post-12.05 source.

Patch 12.05 (2026-03-17) reworked A Site / A Main when Lotus re-entered the pool, so every Lotus Sova
row filmed before it is stale. Each source below postdates 12.05 and gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_lotus_sova_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from sova_abilities import ABILITIES

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
SOVA_NOTE = ("THE AGENT IS SOVA, so report ONLY recon (recon bolt) or shock (shock dart); Owl "
             "Drone and Hunter's Fury (his ultimate, three beams) are out of scope. Report CHARGE "
             "(0-2 bars) and BOUNCES (0-2) for every arrow.")

SOURCES = {
    "lotus-maxwell": {
        "video": "K8b5qR-bTek",
        "maxPerChapter": 2,
        "groupNote": (ONE_PER_CHAPTER + " A `(Shocks)` chapter fires TWO darts back to back from "
                      "one stand as ONE lineup: report one placement, not two."),
        "titleNote": ("CHAPTER TITLES READ '<STAND> to <TARGET>' and mark shock darts with a "
                      "'(Shock)' / '(Shocks)' suffix; every other chapter is a recon bolt. Confirm "
                      "the ability from what lands."),
        "titleShort": "the chapter titles name stand and target and mark shock darts",
        "varNoteAdd": ("A bottom-left two-line plate ('From A-Backsite' / 'To A-Root') repeats the "
                       "title - an editor overlay, never an event. The creator often scopes an "
                       "OPERATOR onto the aim reference with a small red circle drawn around it; "
                       "that zoom is a demonstration, the AIM is the bow drawn on that reference. "
                       "The bow shows an on-screen CHARGE bar and a '[ BOUNCES: n ]' readout. "
                       "24fps source: one frame is ~42ms."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 1 `Attack` (0-5, section header). There is no defender header: chapters 2-16
        # are the attack half and 17-31 the defender half (minimap orientation flips at 413s, and
        # the titles turn to defender stands -- A Backsite, B, CT, A Heaven, Waterfall).
        "chapters": [
            (2, 5, 32, "A Lobby to A Main", "recon", ATTACK),
            (3, 32, 55, "A Root to A Tree", "recon", ATTACK),
            (4, 55, 83, "A Orb to A Backsite", "recon", ATTACK),
            (5, 83, 107, "A Tree to A", "recon", ATTACK),
            (6, 107, 142, "A Root to A Default (Shocks)", "shock", ATTACK),
            (7, 142, 164, "A Main to A (Shock)", "shock", ATTACK),
            (8, 164, 189, "B Lobby to B Main", "recon", ATTACK),
            (9, 189, 215, "B Lobby to B", "recon", ATTACK),
            (10, 215, 247, "A Rubble to B Default (Shock)", "shock", ATTACK),
            (11, 247, 267, "B Lobby to B Pit (Shock)", "shock", ATTACK),
            (12, 267, 290, "A Lobby to C Mound", "recon", ATTACK),
            (13, 290, 308, "C Lobby to C Mound", "recon", ATTACK),
            (14, 308, 344, "C Lobby to C", "recon", ATTACK),
            (15, 344, 371, "C Mound to C", "recon", ATTACK),
            (16, 371, 413, "C Mound to C Default (Shocks)", "shock", ATTACK),
            (17, 413, 439, "A Backsite to A Root", "recon", DEFENSE),
            (18, 439, 465, "A Backsite to A Main", "recon", DEFENSE),
            (19, 465, 492, "B to A Rubble", "recon", DEFENSE),
            (20, 492, 525, "B to A Rubble (Shocks)", "shock", DEFENSE),
            (21, 525, 559, "A Tree to A Main", "recon", DEFENSE),
            (22, 559, 594, "B to A Main", "recon", DEFENSE),
            (23, 594, 623, "C Mound to A Main", "recon", DEFENSE),
            (24, 623, 648, "CT to A Default (Shock)", "shock", DEFENSE),
            (25, 648, 675, "A Heaven to A", "recon", DEFENSE),
            (26, 675, 714, "A Heaven to C Mound", "recon", DEFENSE),
            (27, 714, 744, "A to C Mound", "recon", DEFENSE),
            (28, 744, 776, "A to C Entrance (Shocks)", "shock", DEFENSE),
            (29, 776, 808, "B to C Mound", "recon", DEFENSE),
            (30, 808, 838, "Waterfall to C Mound", "recon", DEFENSE),
            (31, 838, 893, "Waterfall to C Plants (Shocks)", "shock", DEFENSE),
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
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_SOVA_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": ABILITIES,
        "varNote": " ".join((CALLOUTS, SOVA_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "lotus_sova_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
