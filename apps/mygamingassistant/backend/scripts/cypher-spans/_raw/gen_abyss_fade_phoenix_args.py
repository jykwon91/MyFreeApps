"""Build workflow args for Fade and Phoenix x Abyss, one args file per source.

Abyss had no Fade or Phoenix rows. Patch 11.08 (2025-10-15) reworked B Site and the Mid hallway
into B Main, so every source below postdates it. Each gets its own pack stem, because ingest_agent
joins on youtube_video_id.

  python gen_abyss_fade_phoenix_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from fade_phoenix_abilities import FADE, PHOENIX

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by its own title. Report side as attacker unless your "
          "window plainly shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by its own title. Report side as defender unless your "
           "window plainly shows an attacking use.")
INFER = ("This chapter's title states NO side. Read it from the footage's own framing and name the "
         "cue in NOTES: the spike carried or planted = attacker; a setup thrown from defender "
         "spawn toward an attacker entrance = defender. Report attacker or defender; if nothing in "
         "the window shows the side, report 'unknown' -- the pack builder excludes that row "
         "rather than guessing.")
ONE_PER_CHAPTER = ("Each chapter on this source is ONE lineup; a survey should normally return "
                   "exactly one placement per chapter.")

CALLOUTS = (
    "Abyss has two sites (A, B) and a mid - use Abyss callouts (A Main, A Lobby, A Site, A Bridge, "
    "A Tower, A Link, A Security, A Secret, A Vent, Mid Top, Mid Bottom, Mid Catwalk, Mid "
    "Library, Mid Bend, B Main, B Lobby, B Site, B Tower, B Heaven, B Nest, B Danger, B Link, "
    "Attacker Side Spawn, Defender Side Spawn). The map has open edges with a fall into the void; "
    "VALORANT's location readout sits top-left, above the minimap. All footage is first-person. "
    "This footage postdates patch 11.08, which reworked B Site and the Mid hallway into B Main.")
FADE_NOTE = ("THE AGENT IS FADE, so report ONLY haunt or seize; Prowler (a steered creature) and "
             "Nightfall (her ultimate wave) are out of scope.")
PHOENIX_NOTE = ("THE AGENT IS PHOENIX, so report ONLY hot-hands; Curveball (a flash), Blaze (a "
                "fire wall) and Run It Back are out of scope.")

SOURCES = {
    "abyss-lnx": {
        "agent": "FADE", "video": "7N1Q4SFvaHE", "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read 'Abyss "
                      "<Attack|Defense> - <A Site|B Site|Mid>'. Call the ability from what "
                      "deploys."),
        "titleShort": "the chapter titles on this source name no ability",
        "varNoteAdd": ("Each chapter opens on a ~2s full-screen TITLE CARD ('DEFENSE / A SITE') and "
                       "the editor burns a 'JUMP-THROW' caption over jump-throws -- overlays, never "
                       "events, though the caption states the technique."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        "chapters": [
            (1, 3, 20, "Abyss Defense - A Site", "haunt", DEFENSE),
            (2, 20, 39, "Abyss Defense - A Site", "haunt", DEFENSE),
            (3, 39, 55, "Abyss Defense - A Site", "haunt", DEFENSE),
            (4, 55, 75, "Abyss Defense - B Site", "haunt", DEFENSE),
            (5, 75, 94, "Abyss Defense - B Site", "haunt", DEFENSE),
            (6, 94, 115, "Abyss Defense - B Site", "haunt", DEFENSE),
            (7, 115, 132, "Abyss Defense - Mid", "haunt", DEFENSE),
            (8, 132, 151, "Abyss Attack - A Site", "haunt", ATTACK),
            (9, 151, 169, "Abyss Attack - A Site", "haunt", ATTACK),
            (10, 169, 185, "Abyss Attack - A Site", "haunt", ATTACK),
            (11, 185, 204, "Abyss Attack - B Site", "haunt", ATTACK),
            (12, 204, 220, "Abyss Attack - B Site", "haunt", ATTACK),
            (13, 220, 238, "Abyss Attack - B Site", "haunt", ATTACK),
            (14, 238, 257, "Abyss Attack - Mid", "haunt", ATTACK),
        ],
    },
    "abyss-frost": {
        "agent": "FADE", "video": "5yqNa4HIq5Q", "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read 'Fade Lineup "
                      "Abyss <TARGET> from <STAND>'. Call the ability from what deploys."),
        "titleShort": "the chapter titles on this source name no ability",
        "varNoteAdd": ("A custom game with a 'Client FPS' readout top-left. The creator sometimes "
                       "draws a marker onto the alignment point -- an EDITOR overlay, never an "
                       "event."),
        "chapters": [
            (1, 10, 22, "Fade Lineup Abyss A Site (Front) from A Main", "haunt", INFER),
            (2, 22, 35, "Fade Lineup Abyss A Site (Front) from A Main", "haunt", INFER),
            (3, 35, 49, "Fade Lineup Abyss B Site from B Lobby", "haunt", INFER),
            (4, 49, 59, "Fade Lineup Abyss B Site from B Lobby", "haunt", INFER),
        ],
    },
    "abyss-mada": {
        "agent": "PHOENIX", "video": "suTAk5BOVnc", "maxPerChapter": 2,
        "groupNote": "This source is a single 24s clip holding ONE lineup.",
        "titleNote": ("THE TITLE NAMES THE UTILITY: 'Abyss Phoenix B Main Punish Molly' -- a "
                      "hot-hands molly into B Main. Confirm it from what deploys."),
        "titleShort": "the title names a molly into B Main",
        "varNoteAdd": ("The clip is a Korean-client custom game: the buy-phase banner reads '구매 "
                       "단계' and a settings menu flashes on screen mid-clip -- overlays, never "
                       "events."),
        "chapters": [
            (1, 0, 24, "Abyss Phoenix B Main Punish Molly", "hot-hands", INFER),
        ],
    },
}


def main():
    stem = sys.argv[1]
    src = SOURCES[stem]
    fade = src["agent"] == "FADE"
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "abyss", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in src["chapters"]]

    args = {
        "map": "abyss", "video": src["video"],
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_%s_%s.md"
                              % (src["agent"], stem.upper())),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": FADE if fade else PHOENIX,
        "varNote": " ".join((CALLOUTS, FADE_NOTE if fade else PHOENIX_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "abyss_%s_args_%s.json" % (src["agent"].lower(), src["video"]))
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
