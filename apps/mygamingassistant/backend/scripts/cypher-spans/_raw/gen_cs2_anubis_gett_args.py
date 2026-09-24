"""Build workflow args for CS2 x Anubis from GettClutch's `zCVFwsUktls` (2026-07-14, 190s, 1080p60).

"New META Utility & Tricks on Anubis" postdates the 2026-01-22 Anubis rework, the 2026-02-05
clipping fix and the 2026-04-21 AnimGraph2 throw change. Mixed utility; the Combo / Execute chapters
throw several grenades. Two chapters are left out because no grenade lineup is thrown in them
(checked on a 1s contact sheet + a 6fps sheet of 114.5-117.5s):
  - 115-122 "Heaven Boost": a boost onto Heaven; the grenades in its first second are a teammate's,
    already in flight when the chapter opens.
  - 179-190 "Water Silent Drop": a silent-drop movement trick ("Hold Shift+W"); nothing is thrown.

  python gen_cs2_anubis_gett_args.py
"""
import json
import os

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")
VIDEO = "zCVFwsUktls"

T = "T-side execute utility. Report side T unless the frames plainly show CT use."
CT = "CT-side utility. Report side CT unless the frames plainly show T use."
INFER = ("The title states no side. Read it from the footage: thrown from T territory toward a site "
         "= T; anti-rush / retake utility from CT territory = CT. The POV rifle helps (AK = T, "
         "M4 = CT). Name the cue in NOTES.")
LEAN_CT = ("The title states no side, but the POV carries an M4 (a CT rifle) in the coarse sheet -- "
           "probably CT early-round control. Confirm from where it is thrown and name the cue in NOTES.")

# (start, end, title, fallback utility, side note) from yt-dlp's chapter metadata. The in-video
# overlay sometimes names a chapter differently: 0-19 reads "Spawn Smokes", 58-72 "Temple+Ninja
# Combo", 144-151 "A Main Support Flash", 151-169 "A Smokes Wall".
CHAPTERS = [
    (0, 19, "Mid+Con Smokes", "smoke", T),
    (19, 28, "Early Window Combo", "molotov", INFER),
    (28, 42, "B Execute", "smoke", T),
    (42, 58, "B Execute V2", "smoke", T),
    (58, 72, "B Combo (Con)", "molotov", T),
    (72, 88, "Con Retake", "molotov", CT),
    (88, 95, "Ninja Pop Flash", "flash", INFER),
    (95, 107, "Early Stairs Control", "smoke", LEAN_CT),
    (107, 115, "Mid Support Flash", "flash", LEAN_CT),
    (122, 129, "Stairs Nade", "grenade", LEAN_CT),
    (129, 144, "A Execute", "smoke", T),
    (144, 151, "Main Support Flash", "flash", INFER),
    (151, 169, "A Smoke Wall", "smoke", T),
    (169, 179, "Mid Doors Molly", "molotov", INFER),
]

CALLOUTS = (
    "Anubis after the 2026-01-22 rework. Use Anubis callouts for stand and target (A Main, A Site, "
    "Heaven, Camera, Platform, B Main, B Site, E-Box, Pillar, Ninja, Temple, Mid, Mid Window, Mid "
    "Doors, House, Connector (Con), Canal/Water, Bridge, Street, T Stairs, T Spawn, CT Spawn, "
    "Backsite).")
SOURCE = ("GettClutch's fast utility guide: HUD off, short cuts -- walk to the spot, aim, throw, then "
          "the result, often from a second angle. The overlay in the top-left repeats the chapter name; "
          "cue captions such as 'Left Click+Jump' / 'Run+Left Click Throw' are overlays, never events, "
          "but they state the technique.")


def main():
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end, "ability": ability,
              "name": title, "map": "anubis", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(CHAPTERS)]
    args = {
        "map": "anubis", "video": VIDEO, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_ANUBIS_%s.md" % VIDEO),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": 4,
        "captions": False,
        "groupNote": "'Combo' / 'Execute' / plural ('Smokes') chapters throw SEVERAL grenades, often "
                     "mixed utility -- return one placement per grenade thrown (a distinct stand spot "
                     "or a distinct target). A single-utility title ('Pop Flash', 'Molly', 'Nade') is "
                     "usually ONE lineup.",
        "titleNote": "Chapter titles name the utility and/or its target; a 'Combo' / 'Execute' title "
                     "names neither the count nor the utilities -- confirm each from what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((CALLOUTS, SOURCE)),
        "items": items,
    }
    out = os.path.join(HERE, "anubis_cs2_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    print("%s: %d chapters -> %s" % (VIDEO, len(items), os.path.basename(out)))


main()
