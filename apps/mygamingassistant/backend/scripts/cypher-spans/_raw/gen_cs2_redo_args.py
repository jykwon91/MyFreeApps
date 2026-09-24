"""Build workflow args for two CS2 creator REDOS that replace pre-rework rows in the library.

  - Tigerr `fJ0TTHKJne0` (2026-01-26, 476s, 1440p60): "The Utility That Actually Wins Anubis Games".
    His post-rework redo of `et6AZ5a5k3I` (2026-01-12, ten days BEFORE the 2026-01-22 Anubis rework),
    with nearly the same chapter names. Most chapters are one lineup; 'Hole/Window Utility' and 'Deep
    Mid Smokes' group several.
  - NartOutHere `xEhS-AmIzIw` (2025-11-11, 516s, 1080p60): "CS2 Ancient Smokes You NEED to Know in
    2026". His post-2025-08-14-update redo of `H9-LFlmPe4U` (2024-12-29). 46 chapters, one smoke each
    except the 'From 1 Position / Spot' and 'Defensive / Mid Smokes' chapters.

Chapter bounds come from yt-dlp (`dump_chapters.py`); Intro/Outro are left out. NartOutHere's chapters
are 6-16s and often cut straight to the next stand, so each window is padded PAD seconds past its end
to give a late bloom room -- the localizer still pins THIS chapter's throw.

  python gen_cs2_redo_args.py
"""
import json
import os

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")
PAD = 3

T = "T-side utility. Report side T unless the frames plainly show CT use."
CT = "CT-side utility. Report side CT unless the frames plainly show T use."
INFER = ("The title states no side. Read it from the footage: thrown from T territory toward a site "
         "= T; anti-rush / retake utility from CT territory = CT. The POV rifle helps (AK = T, "
         "M4 = CT). Name the cue in NOTES.")

ANUBIS = (
    "Anubis after the 2026-01-22 rework. Use Anubis callouts for stand and target (A Main, A Site, "
    "Heaven, Camera, Platform, B Main, B Site, E-Box, Pillar, Ninja, Temple, Mid, Mid Window, Mid "
    "Doors, House, Connector (Con), Canal/Water, Bridge, Street, T Stairs, T Spawn, CT Spawn, "
    "Backsite).")
ANCIENT = (
    "Ancient. Use Ancient callouts for stand and target (T Spawn, Mid, Top Mid, Red Room, Window, "
    "Cubby, Heaven, Elbow, Donut, A Main, A Site, Temple, CT, Cave, B Ramp/B Main, B Lane, B Long, "
    "B Short, B Doors, B Site, Pillar, Cheetah, Jaguar, CT Spawn). A is the upper-LEFT site (A Main "
    "up the left), B the RIGHT site (B Ramp below it); Donut links Mid to A, Cave links Mid to B.")

SOURCES = {
    "fJ0TTHKJne0": {
        "map": "anubis", "doc": "ANUBIS", "per": 6, "pad": 0, "callouts": ANUBIS,
        "group": ("Most chapters are ONE lineup. 'Hole/Window Utility' and 'Deep Mid Smokes' throw "
                  "SEVERAL grenades, often mixed utility -- return one placement per grenade thrown."),
        "chapters": [
            (37, 52, "House Smoke", "smoke", T),
            (52, 90, "E Box Smoke", "smoke", T),
            (90, 231, "Hole/Window Utility", "smoke", INFER),
            (231, 238, "B Site - Left Side Smoke", "smoke", T),
            (238, 272, "B Site - Right Side Smoke", "smoke", T),
            (272, 306, "B Site - Pillar Molotov", "molotov", T),
            (306, 331, "A Site - Heaven Smoke", "smoke", T),
            (331, 359, "A Site - Camera Smoke", "smoke", T),
            (359, 380, "A Site - Camera Molotov", "molotov", T),
            (380, 427, "A Site Flash", "flash", T),
            (427, 460, "Deep Mid Smokes", "smoke", T),
        ],
        "source": ("Tigerr's guide: a practice server with the HUD and a ROTATING minimap on, each "
                   "lineup shown as walk-to-spot, aim, throw, result, often with a grenade-cam inset "
                   "(PIP) and repeat throws -- match the game clock to tie a result to its throw. A "
                   "title card ('SMOKE #2' / 'E BOX SMOKE') marks each lineup; it is an overlay, never "
                   "an event."),
    },
    "xEhS-AmIzIw": {
        "map": "ancient", "doc": "ANCIENT", "per": 3, "pad": PAD, "callouts": ANCIENT,
        "group": ("Each chapter is normally ONE smoke. 'From 1 Position' / 'From 1 Spot' / 'Defensive "
                  "Smokes' / 'Mid Smokes' chapters throw several -- return one placement per smoke."),
        "chapters": [
            (38, 45, "Window From Left Side Spawn", "smoke", T),
            (45, 51, "Red From Right Side Spawn", "smoke", T),
            (51, 58, "Window Smoke From Yard", "smoke", T),
            (58, 64, "Red Smoke From Elbow", "smoke", INFER),
            (64, 78, "Mid Donut", "smoke", T),
            (78, 89, "Ancient Donut Smoke for Mid", "smoke", T),
            (89, 97, "Donut Mid Smoke From Elbow", "smoke", INFER),
            (97, 109, "Ancient Cheetah Smoke", "smoke", T),
            (109, 116, "Cheetah Ancient Smoke", "smoke", T),
            (116, 127, "B Lurk", "smoke", T),
            (127, 135, "Cave to Rush B", "smoke", T),
            (135, 144, "Ancient Cave Smoke", "smoke", T),
            (144, 151, "Short From B Main", "smoke", T),
            (151, 160, "Ancient Short Smoke", "smoke", T),
            (160, 171, "Short Ancient Smoke", "smoke", T),
            (171, 179, "Long Smoke From B Main", "smoke", T),
            (179, 187, "Ancient B Long Smoke", "smoke", T),
            (187, 193, "Long Ancient Smoke", "smoke", T),
            (193, 199, "Speedway Smoke", "smoke", T),
            (199, 211, "Ancient Speedway", "smoke", T),
            (211, 227, "Ancient B Smokes From 1 Position", "smoke", T),
            (227, 237, "CT", "smoke", T),
            (237, 246, "CT HS Smoke", "smoke", T),
            (246, 258, "Ancient CT Smoke", "smoke", T),
            (258, 266, "CT Ancient Smoke to Rush A", "smoke", T),
            (266, 272, "CT From A Main", "smoke", T),
            (272, 279, "CT From Mid Donut", "smoke", T),
            (279, 287, "A Donut", "smoke", T),
            (287, 335, "Ancient A Donut Smoke", "smoke", T),
            (335, 351, "Deep A Donut Smoke Ancient", "smoke", T),
            (351, 358, "A Donut Smoke Deep", "smoke", T),
            (358, 365, "A Donut Smoke From A Main", "smoke", T),
            (365, 376, "Ancient A Smokes From 1 Position", "smoke", T),
            (376, 385, "CT and A Deep Donut Smoke From 1 Spot", "smoke", T),
            (385, 395, "Ancient A Smokes From 1 Spot", "smoke", T),
            (395, 403, "Ancient A Split Smoke", "smoke", T),
            (403, 412, "Easy Instant Elbow Smoke", "smoke", T),
            (412, 424, "Mid Cubby Smoke", "smoke", INFER),
            (424, 433, "Ancient B Door Smoke From CT Spawn", "smoke", CT),
            (433, 440, "B Door Smoke From Long", "smoke", INFER),
            (440, 447, "Banana Smoke for Retake", "smoke", CT),
            (447, 455, "Cave Retake Smoke", "smoke", CT),
            (455, 473, "A Main Retake Smoke", "smoke", CT),
            (473, 483, "A Donut Retake Smoke", "smoke", CT),
            (483, 502, "Ancient Defensive Smokes", "smoke", CT),
            (502, 516, "Ancient Mid Smokes", "smoke", INFER),
        ],
        "source": ("NartOutHere's smoke guide: every chapter is a SMOKE, HUD on (scoreboard, minimap "
                   "location label, round clock). A top-right section label ('Window / Red', 'A DONUT', "
                   "'A MAIN RETAKE') spans several chapters and is an overlay, never an event. Results are "
                   "often drawn with a yellow grenade TRAIL and sometimes seen from a spectator / "
                   "third-person angle; the trail is never evidence of the release. Neighbouring "
                   "chapters often share a stand -- pin THIS chapter's throw."),
    },
}


def build(video, spec):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end + spec["pad"], "ability": ability,
              "name": title, "map": spec["map"], "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": spec["map"], "video": video, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_%s_%s.md" % (spec["doc"], video)),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the utility and/or its target; confirm the utility from "
                     "what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((spec["callouts"], spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        out = os.path.join(HERE, "%s_cs2_args_%s.json" % (spec["map"], video))
        args = build(video, spec)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s" % (video, len(args["items"]), os.path.basename(out)))


main()
