"""Build workflow args for Killjoy x Haven (hoverboarD, U823N6M2UGM).

Haven had zero Killjoy coverage. This is the newest Killjoy Haven guide found (uploaded
2025-12-18, filmed on client 11.11). The only Haven change since is patch 12.00's breakable
Mid Window panel, which can touch at most the `[Atk Alarmbot] Mid Window` chapter -- check that
row's LANDING at pack build rather than holding the whole source.

Unlike the Abyss source, EVERY chapter title here carries a bracketed `[<Side> <Ability>]` tag
(`[Atk Turret] Mid Grass & C Lobby`, `[Def Nano] CT Spawn to A Site/Long`), and each chapter
demonstrates one placement. So `ability` and side come from the creator's own tag, and the survey
stage is kept only as the safety net for a chapter that turns out to hold more than one.

Chapters excluded by name: `Intro` only. The source has no ultimate chapter.
"""
import json
import os
import re

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_HAVEN.md")
VIDEO = "U823N6M2UGM"

# (index, start, end, title) straight from yt-dlp's chapter metadata. Index 0 (`Intro`) excluded.
CHAPTERS = [
    (1, 12, 41, "[Atk Turret] Mid Grass & C Lobby"),
    (2, 41, 47, "[Atk Alarmbot] A Garden/Lobby"),
    (3, 47, 53, "[Atk Alarmbot] Mid Window"),
    (4, 53, 87, "[Atk Turret] Mid & Mid Grass"),
    (5, 87, 128, "[Atk Turret] Mid Grass & Mid"),
    (6, 128, 136, "[Atk Alarmbot] C Lobby/Dragon"),
    (7, 136, 144, "[Atk Alarmbot] C Lobby/Spawn"),
    (8, 144, 171, "[Atk Nano] A Garden to A Long Ramp"),
    (9, 171, 199, "[Atk Nano] A Garden to A Sewer/Short"),
    (10, 199, 231, "[Atk Nano] A Garden to Mid Rabbit"),
    (11, 231, 265, "[Atk Nano] A Long to A Site Back"),
    (12, 265, 289, "[Atk Nano] A Long to A Site Heaven"),
    (13, 289, 315, "[Atk Nano] A Long to A Site Hell"),
    (14, 315, 341, "[Atk Nano] A Long to A Site/Tunnel"),
    (15, 341, 371, "[Atk Nano] A Long to A Site Quad"),
    (16, 371, 404, "[Atk Nano] C Lobby to C Site/Garage"),
    (17, 404, 436, "[Atk Nano] C Lobby to C Site/Monkey"),
    (18, 436, 465, "[Def Turret] C Garage & C Site"),
    (19, 465, 494, "[Def Turret] C Long & C Garage"),
    (20, 494, 502, "[Def Alarmbot] B Site (v1)"),
    (21, 502, 531, "[Def Turret] A Long & A Short"),
    (22, 531, 540, "[Def Alarmbot] B Site (v2)"),
    (23, 540, 568, "[Def Nano] CT Spawn to A Site/Long"),
    (24, 568, 605, "[Def Nano] CT Spawn to C Site/Long"),
    (25, 605, 644, "[Def Nano] A Link to A Long"),
]

TAG = re.compile(r"^\[(Atk|Def) (Turret|Alarmbot|Nano)\] (.+)$")
TAG_ABILITY = {"Turret": "turret", "Alarmbot": "alarmbot", "Nano": "nanoswarm"}
TAG_SIDE = {"Atk": "attacker", "Def": "defender"}

VAR_NOTE = (
    "Haven has THREE sites (A, B, C) - use Haven callouts (A Long, A Short, A Garden, A Lobby, "
    "A Link, A Sewer, Mid Courtyard, Mid Window, Mid Doors, B Site, B Back, C Link, Garage, "
    "C Long, C Lobby, C Site, CT Spawn). Every chapter title on this source opens with a bracketed "
    "TAG naming the SIDE and the ABILITY - [Atk Turret], [Def Alarmbot], [Atk Nano] - followed by "
    "the area. On Nano chapters the area reads '<STAND area> to <TARGET>'; on Turret and Alarmbot "
    "chapters it names the area(s) the device WATCHES, not a stand-to-target pair. The tag is the "
    "creator's own label and a strong prior, but confirm the ability from the equipped device and "
    "the deployed object. The HUD binds C = nanoswarm, Q = alarmbot, E = turret, X = Lockdown - "
    "verified on full-res HUD crops at 25s and 498s. THE AGENT IS KILLJOY IN EVERY CHAPTER, so "
    "report ONLY turret, alarmbot or nanoswarm. A deployed nanoswarm in range shows an "
    "'F DETONATE' prompt that neither placed device does. EDITOR OVERLAYS on this source, none of "
    "which is ever an event: a pink serif title across the top centre naming the area, a pink "
    "ability icon in the top-right corner for the whole chapter, and on some lineups a red drawn "
    "octagon outlining the alignment reference. The in-world placement preview for turret and "
    "alarmbot is drawn PINK/MAGENTA over a cyan range ring on the floor - that preview is the AIM, "
    "never the LANDING. Some placements are made during the buy phase behind the translucent "
    "spawn-barrier walls; the barrier is round geometry, not utility. The minimap's orientation "
    "differs between the attack and defence chapters, so it locates you but does not tell you "
    "which way you face. All footage is first-person.")


def main():
    items = []
    for idx, s, e, title in CHAPTERS:
        m = TAG.match(title)
        if m is None:
            raise SystemExit(f"ABORT - chapter {title!r} has no [<Side> <Ability>] tag. Every "
                             f"in-scope chapter on this source carries one; a title without it is "
                             f"a transcription error, not a chapter to guess an ability for.")
        side = TAG_SIDE[m.group(1)]
        items.append({
            "nn": "%02d" % idx, "cs": s, "next": e,
            "ability": TAG_ABILITY[m.group(2)], "name": title, "map": "haven",
            "varNoteAdd": (f"The creator tags this chapter {side.upper()}-side and "
                           f"{m.group(2).upper()}. Report side as {side} unless your own window "
                           f"plainly contradicts it."),
        })

    args = {
        "map": "haven", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # One placement per chapter by the creator's own structure. The cap is headroom for a
        # chapter that repeats its spot (the 34-41s turret chapters), not an expected count.
        "maxPerChapter": 4,
        "captions": True,
        "captionExamples": ('"Mid Grass & C Lobby", "A Long to A Site/Tunnel", "B Site (v1)" '
                            '(a pink serif title across the top centre)'),
        "groupNote": ("Each chapter on this source demonstrates ONE placement. A chapter that "
                      "shows the same spot twice (a retry, or the device shown from a second "
                      "angle) is still one placement."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE OPEN WITH A [<Side> <Ability>] TAG -- "
                      "'[Atk Turret] Mid Grass & C Lobby', '[Def Nano] CT Spawn to A Site/Long'. "
                      "The tag is the creator's label for the chapter's one placement; confirm the "
                      "ability from what is deployed."),
        "titleShort": "the chapter title's [<Side> <Ability>] tag",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "haven_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, _ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    for ab in ABILITIES:
        print("   %-9s %d" % (ab, sum(1 for i in items if i["ability"] == ab)))


main()
