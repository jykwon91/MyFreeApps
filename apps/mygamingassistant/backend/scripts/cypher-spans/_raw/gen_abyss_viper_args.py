"""Build workflow args for Viper x Abyss, one args file per post-11.08 source.

Abyss's only Viper pack (Tseeky, VNYjHQrBmoY, stem `abyss`) is from June 2024. Patch 11.08
(2025-10-15) reworked B Site and turned the Mid hallway into B Main after that, so its B-side and
mid rows show a layout that no longer exists. Each source below postdates 11.08 and gets its own
pack stem, because ingest_agent joins on youtube_video_id.

  python gen_abyss_viper_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from viper_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by its own title (an attack / execute setup). Report "
          "side as attacker unless your window plainly shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by its own title (a defense / hold setup). Report side "
           "as defender unless your window plainly shows an attacking use.")
INFER = ("This chapter's title states NO side. Read it from the footage's own framing and name the "
         "cue in NOTES: the spike carried or planted = attacker; a setup thrown from defender "
         "spawn toward an attacker entrance = defender. Report attacker or defender; if nothing in "
         "the window shows the side, report 'unknown' -- the pack builder excludes that row "
         "rather than guessing.")
GROUPED = ("This source groups several separate placements into ONE chapter -- walls, orbs and "
           "mollies back to back, often a wall and an orb as one setup.")
GROUPED_TITLE = ("CHAPTER TITLES ON THIS SOURCE NAME A ROLE OR A SETUP, NOT EACH PLACEMENT'S "
                 "ABILITY. Call every ability from what is actually deployed.")

# Same Abyss callout text as gen_abyss_fade_phoenix_args.CALLOUTS.
CALLOUTS = (
    "Abyss has two sites (A, B) and a mid - use Abyss callouts (A Main, A Lobby, A Site, A Bridge, "
    "A Tower, A Link, A Security, A Secret, A Vent, Mid Top, Mid Bottom, Mid Catwalk, Mid "
    "Library, Mid Bend, B Main, B Lobby, B Site, B Tower, B Heaven, B Nest, B Danger, B Link, "
    "Attacker Side Spawn, Defender Side Spawn). The map has open edges with a fall into the void; "
    "VALORANT's location readout sits top-left, above the minimap. All footage is first-person. "
    "This footage postdates patch 11.08, which reworked B Site and the Mid hallway into B Main.")
VIPER_NOTE = ("THE AGENT IS VIPER, so report ONLY snake-bite, poison-cloud or toxic-screen; her "
              "ultimate (Viper's Pit, a huge gas dome) is out of scope.")

SOURCES = {
    "abyss-raion": {
        "video": "1IHb4QNlEBI",
        # Chapters run 53-210s with many placements each (the Sunset Locked source, 24-160s,
        # used 16).
        "maxPerChapter": 20,
        "groupNote": GROUPED,
        "titleNote": GROUPED_TITLE,
        "titleShort": "the chapter titles on this source name a role, not each ability",
        "varNoteAdd": ("The creator's WEBCAM is a picture-in-picture box at the left under the "
                       "minimap throughout -- an overlay, never an event. He sometimes opens the "
                       "full-screen in-game MAP (a large map in the centre of frame) or the "
                       "loadout / settings screens between placements; those are menus, not a "
                       "deploy, and the wall's real AIM is first-person right before the fire."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 7 `Tips` (884-976: settings menus, buy-phase walks and a talking-head tail --
        # general advice, not a setup) and 8 `Outro` (976-1007, webcam only).
        "chapters": [
            (1, 0, 193, "Attack B Site", "toxic-screen", ATTACK),
            (2, 193, 294, "Attack A Site", "toxic-screen", ATTACK),
            (3, 294, 459, "Smoke Mid Attack", "poison-cloud", ATTACK),
            (4, 459, 512, "Wall Mid Attack", "toxic-screen", ATTACK),
            (5, 512, 722, "Defense B", "toxic-screen", DEFENSE),
            (6, 722, 884, "Defense A", "toxic-screen", DEFENSE),
        ],
    },
    "abyss-inuis": {
        "video": "Y4EW7dlWmrM",
        "maxPerChapter": 8,
        "groupNote": GROUPED,
        "titleNote": ("THIS SOURCE HAS NO CHAPTERS. Its windows below follow the SECTION LABEL "
                      "the editor burns in at the top-right ('B Site setup', 'A Site setup', "
                      "'A Wall + Orb', 'B Wall + Orb + Exec Snakebite', 'Mid Orb (Similar to "
                      "FF Reazy's)'), which names a setup, not each placement's ability. Call "
                      "every ability from what is actually deployed."),
        "titleShort": "the section labels on this source name a setup, not each ability",
        "varNoteAdd": ("The top-right SECTION LABEL is an editor overlay, never an event. The "
                       "player idles with the melee knife out between placements; the knife is "
                       "not a stance."),
        # Windows from a 2s coarse skim, boundaries refined at 0.5s where the section label
        # changes (29.0 / 51.0 / 73.0 / 144.5).
        "chapters": [
            (1, 0, 29, "B Site setup", "toxic-screen", INFER),
            (2, 29, 51, "A Site setup", "poison-cloud", INFER),
            (3, 51, 73, "A Wall + Orb", "toxic-screen", INFER),
            (4, 73, 144, "B Wall + Orb + Exec Snakebite", "toxic-screen", ATTACK),
            (5, 144, 172, "Mid Orb (Similar to FF Reazy's)", "poison-cloud", INFER),
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
        "varNote": " ".join((CALLOUTS, VIPER_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "abyss_viper_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
