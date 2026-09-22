"""Build workflow args for Killjoy x Sunset, SECOND source (Chiru, MgMzBBl8TVg).

Reco's `shvDHsAXn9g` is the first Sunset source; this one gets its own pack stem `sunset-src2`
because ingest_agent joins on youtube_video_id. Uploaded 2024-06-20 on client 08.11; Sunset's
layout has not changed since, so every chapter is in and none needs a `held` override.

Same creator and recording setup as the Haven and Lotus second sources: a custom game with a 1:40
timer and a network-stats bar, no editor titles or captions, no ability in any title. Two
differences on this video: the minimap ROTATES with the view, and the creator drops world PINGS
whose labels name a callout and a distance ('A Site 2m', 'Mid Tiles 7m', 'B Lobby 16m').
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_SUNSET-SRC2.md")
VIDEO = "MgMzBBl8TVg"

SETUP = ("This chapter is a DEFENDER setup by its own title: a whole site setup -- usually several "
         "devices of DIFFERENT abilities placed back to back. Report side as defender unless your "
         "own window plainly contradicts it.")
POSTPLANT = ("This chapter is ATTACKER-side by its own title: a post-plant lineup thrown to cover "
             "the planted spike. Report side as attacker.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (0, 0, 29, "A Setup 1", "turret", SETUP),
    (1, 29, 58, "A Setup 2", "turret", SETUP),
    (2, 58, 88, "B Setup 1", "turret", SETUP),
    (3, 88, 122, "B Setup 2", "turret", SETUP),
    (4, 122, 145, "A Default Post plant Lineup", "nanoswarm", POSTPLANT),
    (5, 145, 161, "A Default Post plant Lineup #2", "nanoswarm", POSTPLANT),
    (6, 161, 186, "A Behind Box Post plant Lineup", "nanoswarm", POSTPLANT),
    (7, 186, 212, "B Default Post plant Lineup", "nanoswarm", POSTPLANT),
    (8, 212, 231, "B Default Post plant Lineup #2", "nanoswarm", POSTPLANT),
    (9, 231, 257, "B Stairs Post plant Lineup", "nanoswarm", POSTPLANT),
]

VAR_NOTE = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "NO chapter title on this source names an ability, and there are NO editor titles, captions, "
    "arrows or ability icons - the footage is the only evidence. The HUD binds C = nanoswarm, Q = "
    "alarmbot, E = turret, X = Lockdown (verified on full frames at 15s, 130s and 200s). THE AGENT "
    "IS KILLJOY IN EVERY CHAPTER, so report ONLY turret, alarmbot or nanoswarm. The NANOSWARM is "
    "the device Killjoy HOLDS as a model - a small canister with an orange domed top, a white "
    "body and orange eyes, in her right hand before the throw - and while it is equipped a "
    "two-mouse-button throw prompt sits above the C slot. The TURRET and ALARMBOT project a "
    "PINK/MAGENTA placement preview onto the surface under the crosshair instead; that preview is "
    "the AIM, never the LANDING. A deployed nanoswarm in range shows an 'F DETONATE' prompt. The "
    "creator drops WORLD PINGS: a small marker with a label naming a callout and a distance ('A "
    "Site 2m', 'Mid Tiles 7m', 'B Lobby 16m') - game UI, never an event, though the label can "
    "corroborate where a device sits. Sunset has green diamond-lattice backlit glass crates and "
    "doors; they are map geometry, not a hologram. This is a custom game with a 1:40 round timer, "
    "a scoreboard and a network-stats bar across the top; VALORANT's location readout sits "
    "directly beneath that bar ('A Site', 'B Lobby', 'Attacker Side Spawn' observed). The minimap "
    "ROTATES with the view, so its orientation is not north-up. All footage is first-person.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "sunset", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in CHAPTERS]

    args = {
        "map": "sunset", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # Setup chapters run 29-34s and place a site setup each; see the Lotus src2 generator.
        "maxPerChapter": 8,
        "captions": False,
        "groupNote": ("The SETUP chapters on this source each demonstrate a whole site setup -- "
                      "several separate placements of DIFFERENT abilities back to back. The "
                      "post-plant chapters each show a nanoswarm lineup."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<Site> Setup "
                      "<n>' or '<Site> <spot> Post plant Lineup'. Call every ability from what is "
                      "actually deployed."),
        "titleShort": "the chapter titles on this source name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "sunset_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
