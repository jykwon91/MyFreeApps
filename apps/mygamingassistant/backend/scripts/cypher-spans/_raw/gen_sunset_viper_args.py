"""Build workflow args for Viper x Sunset, one args file per post-9.08 source.

Sunset's only Viper pack (Snapiex, V5212_RxPYQ) is from 2023-09. Patch 9.08 (Oct 2024) reworked B
Main, B site and Mid Courtyard after that, and the pack was never ingested. Each source below
postdates 9.08 and gets its own pack stem, because ingest_agent joins on youtube_video_id.

  python gen_sunset_viper_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from viper_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

POSTPLANT = ("This lineup is ATTACKER-side by the source's own framing: a post-plant molly thrown "
             "by a player carrying the spike, onto the plant spot. Report side as attacker.")

ATTACK = ("This chapter is ATTACKER-side by its own title (an attack / post-plant / lurk setup). "
          "Report side as attacker unless your window plainly shows a defensive use.")
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

VAR_NOTE = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "THE AGENT IS VIPER, so report ONLY snake-bite, poison-cloud or toxic-screen; her ultimate "
    "(Viper's Pit, a huge gas dome) is out of scope. VALORANT's location readout sits top-left, "
    "above the minimap ('B Lobby' observed). Sunset has green diamond-lattice backlit glass "
    "crates and doors; they are map geometry, not gas. All footage is first-person.")

SOURCES = {
    "sunset-frost": {
        "video": "XfRvdsxx1P8",
        "maxPerChapter": 2,
        "groupNote": ("Each chapter on this source is ONE lineup; a survey should normally return "
                      "exactly one placement per chapter."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read 'Viper Lineup "
                      "Sunset <TARGET> from <STAND>'. Call the ability from what deploys."),
        "titleShort": "the chapter titles on this source name no ability",
        "varNoteAdd": ("The creator draws a RED ARROW onto the alignment point during the aim; it "
                       "is an EDITOR overlay, never an event. A custom game with a 'Client FPS' "
                       "readout top-left."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        "chapters": [
            (23, 357, 380, "Viper Lineup Sunset A Default from Lobby", "snake-bite", POSTPLANT),
            (24, 380, 400, "Viper Lineup Sunset B Default from Lobby", "snake-bite", POSTPLANT),
            (25, 400, 419, "Viper Lineup Sunset B Default from Mid Courtyard", "snake-bite",
             POSTPLANT),
            (26, 419, 435, "Viper Lineup Sunset A Back Crates from Top Mid", "snake-bite",
             POSTPLANT),
        ],
    },
    "sunset-nats": {
        "video": "LbcPQO_AdJI",
        "maxPerChapter": 24,
        "groupNote": GROUPED,
        "titleNote": ("THE ONLY CHAPTER TITLE HERE IS THE MAP NAME ('Sunset'). Call every ability "
                      "from what is actually deployed."),
        "titleShort": "the chapter title here is only the map name",
        "varNoteAdd": ("The creator's WEBCAM is a picture-in-picture box at the left under the "
                       "minimap, and editor text is burned in at times ('1280x960', 'BUY PHASE') "
                       "-- overlays, never events."),
        "chapters": [
            (8, 1042, 1179, "Sunset", "toxic-screen", INFER),
        ],
    },
    "sunset-coachcow": {
        "video": "X8erN-c1kyE",
        "maxPerChapter": 10,
        "groupNote": GROUPED,
        "titleNote": GROUPED_TITLE,
        "titleShort": "the chapter titles on this source name a role, not each ability",
        "varNoteAdd": ("The creator sometimes draws a RED ARROW onto the HUD or an alignment point "
                       "-- an EDITOR overlay, never an event."),
        "chapters": [
            (1, 81, 100, "B Attacking Viper Wall", "toxic-screen", ATTACK),
            (2, 100, 120, "B Poison Cloud + Wall Combo", "poison-cloud", INFER),
            (3, 120, 129, "A Attacking Viper Wall", "toxic-screen", ATTACK),
            (4, 129, 151, "A Poison Cloud + Wall Combo", "poison-cloud", INFER),
            (5, 151, 180, "Defender Viper Walls", "toxic-screen", DEFENSE),
            (6, 180, 211, "Viper Poison Cloud Lineups", "poison-cloud", INFER),
            (7, 211, 248, "Viper Molly Lineups", "snake-bite", INFER),
        ],
    },
    "sunset-locked": {
        "video": "KrlfJElQex4",
        "maxPerChapter": 16,
        "groupNote": GROUPED,
        "titleNote": GROUPED_TITLE,
        "titleShort": "the chapter titles on this source name a role, not each ability",
        "varNoteAdd": ("The creator often shows a LARGE MAP with the cyan wall line on it as a "
                       "demonstration; the wall's real AIM is first-person, right before the fire."),
        "chapters": [
            (39, 2904, 2942, "A attack", "toxic-screen", ATTACK),
            (40, 2942, 2966, "Mid orb", "poison-cloud", INFER),
            (41, 2966, 3007, "B attack", "toxic-screen", ATTACK),
            (42, 3007, 3083, "Post Plant Lineups", "snake-bite", ATTACK),
            (43, 3083, 3150, "Lurk Setup", "toxic-screen", ATTACK),
            (44, 3150, 3212, "Solo Defense", "toxic-screen", DEFENSE),
            (45, 3212, 3236, "Double Defense", "toxic-screen", DEFENSE),
            (46, 3236, 3277, "Market One-way", "poison-cloud", INFER),
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
    out = os.path.join(HERE, "sunset_viper_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
