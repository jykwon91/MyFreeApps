"""Build workflow args for Sova x Abyss, one args file per post-11.08 source.

Abyss's two Sova packs (maxWELL cTrav7nTu2Y, stem `abyss`; Tseeky -W5HiuAQm-o, stem `abyss-2`)
are from June 2024. Patch 11.08 (2025-10-15) reworked B Site and turned the Mid hallway into B Main
after that. Each source below postdates 11.08 and gets its own pack stem, because ingest_agent
joins on youtube_video_id.

  python gen_abyss_sova_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from sova_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by the source's own labelling (the video's attacker "
          "section / the on-screen plate). Report side as attacker unless your window plainly "
          "shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by the source's own labelling (the video's defender "
           "section / the on-screen plate). Report side as defender unless your window plainly "
           "shows an attacking use.")
ONE_PER_CHAPTER = ("Each chapter on this source is ONE lineup; a survey should normally return "
                   "exactly one placement per chapter.")

# Same Abyss callout text as gen_abyss_fade_phoenix_args.CALLOUTS.
CALLOUTS = (
    "Abyss has two sites (A, B) and a mid - use Abyss callouts (A Main, A Lobby, A Site, A Bridge, "
    "A Tower, A Link, A Security, A Secret, A Vent, Mid Top, Mid Bottom, Mid Catwalk, Mid "
    "Library, Mid Bend, B Main, B Lobby, B Site, B Tower, B Heaven, B Nest, B Danger, B Link, "
    "Attacker Side Spawn, Defender Side Spawn). The map has open edges with a fall into the void; "
    "VALORANT's location readout sits top-left, above the minimap. All footage is first-person. "
    "This footage postdates patch 11.08, which reworked B Site and the Mid hallway into B Main.")
SOVA_NOTE = ("THE AGENT IS SOVA, so report ONLY recon (recon bolt) or shock (shock dart); Owl "
             "Drone and Hunter's Fury (his ultimate, three beams) are out of scope. Report CHARGE "
             "(0-2 bars) and BOUNCES (0-2) for every arrow.")

SOURCES = {
    "abyss-yolzy": {
        "video": "liTRXcUDWus",
        "maxPerChapter": 2,
        "groupNote": (ONE_PER_CHAPTER + " A `*Shock Darts` chapter fires TWO darts back to back "
                      "from one stand as ONE lineup: report one placement, not two."),
        "titleNote": ("CHAPTER TITLES NAME THE TARGET (sometimes 'From <STAND>'), and mark shock "
                      "darts with a '*Shock Dart(s)' suffix; every other chapter is a recon bolt. "
                      "Confirm the ability from what lands."),
        "titleShort": "the chapter titles name the target and mark shock darts",
        "varNoteAdd": ("Each chapter OPENS on a HUD-OFF close-up of the DESTINATION with the "
                       "utility already arriving, under a bottom-left plate ('A SITE REVEAL FROM "
                       "A LOBBY' / 'ATTACK') -- a PREVIEW, never the stand or the landing. The "
                       "creator scopes an OUTLAW to show the aim reference up close; that zoom is "
                       "a demonstration, the AIM is the bow drawn on that reference. The arrow's "
                       "flight is often followed by a HUD-less camera. 2160p source."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 1 `The Best Sova Lineups On ABYSS` (0-7, intro) and 13 `Defender Sova Lineups`
        # (267-272, the section header -- chapters before it are attacker, after it defender).
        "chapters": [
            (2, 7, 32, "Broken A Site Reveal From A Lobby", "recon", ATTACK),
            (3, 32, 59, "Simple A Site Reveal", "recon", ATTACK),
            (4, 59, 83, "Fast A Site Reveal", "recon", ATTACK),
            (5, 83, 97, "A Site Cypher Trip Lineup *Shock Dart", "shock", ATTACK),
            (6, 97, 130, "A Site Post-Plant *Shock Darts", "shock", ATTACK),
            (7, 130, 146, "A Site Bridge Post-Plant *Shock Darts", "shock", ATTACK),
            (8, 146, 169, "Simple Mid Reveal", "recon", ATTACK),
            (9, 169, 194, "Best B Site Reveal", "recon", ATTACK),
            (10, 194, 213, "B Site Cypher Trip Lineup *Shock Dart", "shock", ATTACK),
            (11, 213, 236, "Fake B Site Reveal From Spawn", "recon", ATTACK),
            (12, 236, 267, "Fake B Site Reveal From Spawn V2", "recon", ATTACK),
            (14, 272, 297, "A Main Reveal + Sova ULT Combo", "recon", DEFENSE),
            (15, 297, 323, "Simple A Main Reveal", "recon", DEFENSE),
            (16, 323, 338, "A Main ULT Orb *Shock Dart", "shock", DEFENSE),
            (17, 338, 358, "INSANE A Main Reveal From Tower", "recon", DEFENSE),
            (18, 358, 378, "A Main + A Site Reveal From Tower", "recon", DEFENSE),
            (19, 378, 393, "A Site Plant Denial *Shock Darts", "shock", DEFENSE),
            (20, 393, 420, "A Site Support Reveal From Spawn", "recon", DEFENSE),
            (21, 420, 447, "Early Mid Info Reveal", "recon", DEFENSE),
            (22, 447, 470, "Simple Mid Reveal From B Link", "recon", DEFENSE),
            (23, 470, 490, "B Main Reveal + ULT Combo", "recon", DEFENSE),
            (24, 490, 511, "B Main Reveal + Nest", "recon", DEFENSE),
            (25, 511, 537, "Insane B Site Retake Reveal From Spawn", "recon", DEFENSE),
            (26, 537, 555, "Simple B Site Retake Reveal", "recon", DEFENSE),
            (27, 555, 575, "B Site Reveal 2.0", "recon", DEFENSE),
            (28, 575, 614, "B Site Support Reveal From A Site", "recon", DEFENSE),
        ],
    },
    "abyss-valomate": {
        "video": "KKfmFMV-Yas",
        "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES NAME THE ABILITY ('... Shock Bolt NN' = shock, '... Recon "
                      "Bolt NN' = recon) after ONE location, which may be the stand or the "
                      "target -- read both from the footage. Confirm the ability from what "
                      "lands."),
        "titleShort": "the chapter titles name the ability and one location",
        "varNoteAdd": ("A plate top-left reads '<ABILITY> - <ATTACKER|DEFENDER> n / 23' over the "
                       "chapter title, and a static VALOMATE map inset sits top-right with the "
                       "app's pins; both are editor overlays, never events. The client is "
                       "JAPANESE: the location readout is katakana (e.g. 'Aサイト' = A Site, "
                       "'Bリンク' = B Link) -- report the English callout. The creator sometimes "
                       "scopes a sniper rifle to show the reference; that is a demonstration, the "
                       "AIM is the bow drawn on it. 30fps source."),
        # Side from the on-screen plate, read per chapter: plates 1-18/23 ATTACKER, 19-23/23
        # DEFENDER. Dropped: 1 `Intro` (0-3). Chapters 10 and 11 share the title `Site B Shock
        # Bolt 04` in the source; they are two different lineups (plates 9/23 and 10/23).
        "chapters": [
            (2, 3, 28, "A Lobby Shock Bolt 01", "shock", ATTACK),
            (3, 28, 54, "A Main Shock Bolt 01", "shock", ATTACK),
            (4, 54, 92, "B site shock bolt 02", "shock", ATTACK),
            (5, 92, 108, "Site A Shock Bolt 01", "shock", ATTACK),
            (6, 108, 125, "Site A Shock Bolt 02", "shock", ATTACK),
            (7, 125, 143, "Site A Shock Bolt 03", "shock", ATTACK),
            (8, 143, 159, "Site B Shock Bolt 01", "shock", ATTACK),
            (9, 159, 182, "Site B Shock Bolt 03", "shock", ATTACK),
            (10, 182, 195, "Site B Shock Bolt 04", "shock", ATTACK),
            (11, 195, 226, "Site B Shock Bolt 04", "shock", ATTACK),
            (12, 226, 246, "A Main Recon Bolt 02", "recon", ATTACK),
            (13, 246, 269, "Mid Recon Bolt 01", "recon", ATTACK),
            (14, 269, 293, "Site A Recon Bolt 01", "recon", ATTACK),
            (15, 293, 309, "Site A Recon Bolt 03", "recon", ATTACK),
            (16, 309, 327, "Site A Recon Bolt 04", "recon", ATTACK),
            (17, 327, 351, "Site B Recon Bolt 02", "recon", ATTACK),
            (18, 351, 370, "Site B Recon Bolt 03", "recon", ATTACK),
            (19, 370, 399, "Site B Recon Bolt 04", "recon", ATTACK),
            (20, 399, 418, "A Main Shock Bolt 02", "shock", DEFENSE),
            (21, 418, 441, "A Main Shock Bolt 03", "shock", DEFENSE),
            (22, 441, 467, "A Lobby Recon Bolt 01", "recon", DEFENSE),
            (23, 467, 489, "A Main Recon Bolt 01", "recon", DEFENSE),
            (24, 489, 520, "B-main Recon Bolt 01", "recon", DEFENSE),
        ],
    },
}


def main():
    stem = sys.argv[1]
    src = SOURCES[stem]
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "abyss", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in src["chapters"]]

    args = {
        "map": "abyss", "video": src["video"],
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
    out = os.path.join(HERE, "abyss_sova_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
