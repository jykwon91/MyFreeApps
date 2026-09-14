"""Build workflow args for Killjoy x Haven, SECOND source (Chiru, 1FScWR9StjI).

The multi-source rule: one video per agent x map is a defect, because each creator shows a
different subset of spots. hoverboarD (`U823N6M2UGM`) is the first Haven source; this is the second,
kept in its own pack stem `haven-src2` because ingest_agent joins on youtube_video_id and two videos
in one pack would recut every clip from the wrong mp4.

Uploaded 2024-06-15. Haven changes since: patch 11.11 fixed an A Link wallbang and patch 12.00 added
a breakable Mid Window panel. Neither chapter below throws through either spot.

Unlike hoverboarD, NO chapter title here names an ability, and the Setup chapters demonstrate a whole
setup (several devices, mixed abilities) each -- so this source genuinely needs the survey stage.

Excluded by name:
  - `C Lockdown` -- Lockdown only. No ultimate is seeded as a utility_type for any agent.
The two `<Site> Lockdown + Lineup` chapters stay IN: they pair the ult with a nanoswarm lineup, and
the localizer is told to take only the nanoswarm.
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_HAVEN-SRC2.md")
VIDEO = "1FScWR9StjI"

SETUP = ("This chapter is a DEFENDER setup by its own title: a whole site setup -- usually several "
         "devices of DIFFERENT abilities placed back to back. Report side as defender unless your "
         "own window plainly contradicts it.")
LOCKDOWN = ("This chapter pairs Killjoy's LOCKDOWN (the padlock dome, X - an ultimate, NOT in scope) "
            "with a nanoswarm lineup. Enumerate and localize ONLY the nanoswarm(s); never the "
            "Lockdown. The title states no side: call it from what the throw serves and give your "
            "confidence.")
ENTRY = ("This chapter is a nanoswarm lineup into a site from OUTSIDE it (the location readout on "
         "these chapters reads approaches such as A Long). Report side as attacker unless your own "
         "window plainly contradicts it.")
POSTPLANT = ("This chapter is ATTACKER-side by its own title: a post-plant lineup thrown to cover "
             "the planted spike. Report side as attacker.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (0, 0, 25, "A Site Setup 1", "turret", SETUP),
    (1, 25, 57, "A Site Setup 2 A Short", "turret", SETUP),
    (2, 57, 84, "A Site Setup 3 (For Duelist Dashing Or Satcheling)", "turret", SETUP),
    (3, 84, 105, "B Site Setup 1", "turret", SETUP),
    (4, 105, 127, "B Site Setup 2 (Garage Hold)", "turret", SETUP),
    (5, 127, 149, "C Site Setup 1", "turret", SETUP),
    (6, 149, 180, "C Site Setup 2 (Box Setup for Duelist)", "turret", SETUP),
    (7, 180, 199, "A Lockdown + Lineup", "nanoswarm", LOCKDOWN),
    (8, 199, 238, "B Lockdown + Lineup", "nanoswarm", LOCKDOWN),
    (10, 250, 272, "A Behind Green Box Lineup", "nanoswarm", ENTRY),
    (11, 272, 290, "A Short Cubby Lineup", "nanoswarm", ENTRY),
    (12, 290, 306, "A Backsite Lineup", "nanoswarm", ENTRY),
    (13, 306, 324, "C Right Green Box Lineup", "nanoswarm", ENTRY),
    (14, 324, 340, "C Behind Green Box Lineup", "nanoswarm", ENTRY),
    (15, 340, 359, "C Backsite Lineup", "nanoswarm", ENTRY),
    (16, 359, 382, "A Default Post plant Lineup", "nanoswarm", POSTPLANT),
    (17, 382, 400, "A Right Box Post plant Lineup", "nanoswarm", POSTPLANT),
    (18, 400, 416, "B Default Plant Lineup", "nanoswarm", POSTPLANT),
    (19, 416, 434, "C Default Post plant Lineup From Right", "nanoswarm", POSTPLANT),
    (20, 434, 455, "C Default Post plant Lineup From Left", "nanoswarm", POSTPLANT),
]

VAR_NOTE = (
    "Haven has THREE sites (A, B, C) - use Haven callouts (A Long, A Short, A Garden, A Lobby, "
    "A Link, A Sewer, Mid Courtyard, Mid Window, Mid Doors, B Site, B Back, C Link, Garage, "
    "C Long, C Lobby, C Site, CT Spawn). NO chapter title on this source names an ability, and "
    "there are NO editor overlays at all - no burned-in titles, captions, arrows or ability icons - "
    "so the footage is the only evidence. The HUD binds C = nanoswarm, Q = alarmbot, E = turret, "
    "X = Lockdown - verified on a full-res HUD crop at 12s. THE AGENT IS KILLJOY IN EVERY CHAPTER, "
    "so report ONLY turret, alarmbot or nanoswarm. The strongest discriminator on this source: the "
    "NANOSWARM is the only device Killjoy HOLDS as a model - a small canister with an orange domed "
    "top, a white body and orange eyes, sitting in her right hand before the throw - and while it is "
    "equipped a two-mouse-button throw prompt sits above the C slot (verified at 262s). The TURRET and "
    "ALARMBOT are not held that way: while equipped they project a PINK/MAGENTA placement preview "
    "onto the surface under the crosshair (over a cyan range ring on the floor), and that preview "
    "is the AIM, never the LANDING. A deployed nanoswarm in range shows an 'F DETONATE' prompt. "
    "Haven's translucent GREEN-GLASS crates and panels (the 'Green Box' in several chapter titles) "
    "are native map geometry, not a turret hologram and not a nanoswarm cloud. This is a custom "
    "game with a live 1:40 round timer, a scoreboard and a network-stats readout top-left; the "
    "location readout above the minimap is on. All footage is first-person.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "haven", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in CHAPTERS]

    args = {
        "map": "haven", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # A single Setup chapter here runs 21-32s and places a full site setup: a turret, an
        # alarmbot and up to two nanoswarms. 8 is well clear of that, so a chapter returning exactly
        # the cap would still read as truncation rather than as a normal count.
        "maxPerChapter": 8,
        "captions": False,
        "groupNote": ("The SETUP chapters on this source each demonstrate a whole site setup -- "
                      "several separate placements of DIFFERENT abilities back to back. The "
                      "LINEUP chapters each show one nanoswarm throw."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<Site> Site "
                      "Setup <n>', '<Site> <Spot> Lineup', '<Site> Default Post plant Lineup'. "
                      "Call every ability from what is actually deployed."),
        "titleShort": "the chapter titles on this source name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "haven_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   fallbacks:", {i["nn"]: i["ability"] for i in items})


main()
