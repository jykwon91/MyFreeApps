"""Build workflow args for Killjoy x Lotus, SECOND source (Chiru, cvENl2ZCyWQ).

Briiest's `liSWxxXao-I` is the first Lotus source; this one gets its own pack stem `lotus-src2`
because ingest_agent joins on youtube_video_id.

Uploaded 2024-06-19 -- BEFORE patch 12.05 (2026-03-17) reworked Lotus's A Site and A Long. So
every A chapter is excluded by name rather than shipped stale:
  - `A Setup 1`, `A Setup 2`, `A Default Post plant Lineup`
The B and C chapters are untouched by that rework and stay in.

Same creator and recording setup as the Haven second source (gen_haven_src2_killjoy_args.py): a
custom game with a 1:40 timer and network stats, no editor overlays, no ability in any title.
One overlay does exist here: a Like/Subscribe animation over the tail of the last chapter.
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_LOTUS-SRC2.md")
VIDEO = "cvENl2ZCyWQ"

SETUP = ("This chapter is a DEFENDER setup by its own title: a whole site setup -- usually several "
         "devices of DIFFERENT abilities placed back to back. Report side as defender unless your "
         "own window plainly contradicts it.")
POSTPLANT = ("This chapter is ATTACKER-side by its own title: a post-plant lineup thrown to cover "
             "the planted spike. Report side as attacker.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (2, 50, 76, "B Setup 1", "turret", SETUP),
    (3, 76, 96, "C Setup 1", "turret", SETUP),
    (4, 96, 118, "C Setup 2", "turret", SETUP),
    (6, 146, 166, "B Default Post plant Lineup (When Your The Only One Alive)", "nanoswarm",
     POSTPLANT),
    (7, 166, 199, "B Default Post plant Lineup #2 (When Teammate is alive)", "nanoswarm", POSTPLANT),
    (8, 199, 227, "C Default Post Plant Lineup", "nanoswarm", POSTPLANT),
]

VAR_NOTE = (
    "Lotus has THREE sites (A, B, C), rotating stone doors and a mid - use Lotus callouts (B Main, "
    "B Pillars, B Site, B Upper, C Main, C Mound, C Waterfall, C Door, C Link, C Site, C Bend, "
    "C Hall, C Gravel, A Link, Attacker Side Spawn, Defender Side Spawn). NO chapter title on this "
    "source names an ability, and there are NO editor titles, captions, arrows or ability icons - "
    "the footage is the only evidence. The one overlay is a Like/Subscribe animation over the tail "
    "of the final chapter; it is never an event. The HUD binds C = nanoswarm, Q = alarmbot, E = "
    "turret, X = Lockdown. THE AGENT IS KILLJOY IN EVERY CHAPTER, so report ONLY turret, alarmbot "
    "or nanoswarm. The NANOSWARM is the device Killjoy HOLDS as a model - a small canister with an "
    "orange domed top, a white body and orange eyes, in her right hand before the throw - and while "
    "it is equipped a two-mouse-button throw prompt sits above the C slot. The TURRET and ALARMBOT "
    "project a PINK/MAGENTA placement preview onto the surface under the crosshair instead; that "
    "preview is the AIM, never the LANDING. A deployed nanoswarm in range shows an 'F DETONATE' "
    "prompt. In the post-plant chapters a planted-spike icon replaces the round timer at the top. "
    "This is a custom game with a 1:40 round timer, a scoreboard and a network-stats readout "
    "top-left; the location readout above the minimap is on. All footage is first-person.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "lotus", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in CHAPTERS]

    args = {
        "map": "lotus", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # Setup chapters run 20-26s and place a site setup each; see the Haven src2 generator.
        "maxPerChapter": 8,
        "captions": False,
        "groupNote": ("The SETUP chapters on this source each demonstrate a whole site setup -- "
                      "several separate placements of DIFFERENT abilities back to back. The "
                      "post-plant chapters each show a nanoswarm lineup."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<Site> Setup "
                      "<n>' or '<Site> Default Post plant Lineup'. Call every ability from what is "
                      "actually deployed."),
        "titleShort": "the chapter titles on this source name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "lotus_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
