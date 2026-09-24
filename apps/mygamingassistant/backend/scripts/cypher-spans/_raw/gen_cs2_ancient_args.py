"""Build workflow args for CS2 x Ancient from two 2026 sources (both 1080p60 in the cache).

  - GettClutch `dutDQFa4cxA` (2026-07-02, 192s): "New META Utility & Tricks on Ancient". Mixed
    utility, several grenades per Combo / Execute chapter. 172-192 "Wallbangs (Cave)" is left out:
    it shows rifle wallbangs (Elbow / Boost / B Doors), no utility.
  - Tigerr `x3DmUjLu0uk` (2026-07-29, 1120s): "MUST KNOW Ancient Utility for Free Elo". YouTube's
    chapters are five coarse blocks (Mid / B / A / CT SIDE / CT Side - B); they are split here into
    19 single-lineup windows. Boundaries come from his narration (YouTube auto-captions) and the
    on-screen title cards ("SMOKE #1 / MID - RED ROOM SMOKE" ...) read off a 4s contact sheet; each
    window starts where he begins explaining the stand, so it holds the walk-in as well as the throw.

  python gen_cs2_ancient_args.py
"""
import json
import os

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

T = "T-side utility. Report side T unless the frames plainly show CT use."
CT = "CT-side utility. Report side CT unless the frames plainly show T use."
INFER = ("The title states no side. Read it from the footage: thrown from T territory toward a site "
         "= T; anti-rush / retake utility from CT territory = CT. The POV rifle helps (AK = T, "
         "M4 = CT). Name the cue in NOTES.")
LEAN_CT = ("The title states no side, but the coarse sheet shows an M4 (a CT rifle) / CT-side "
           "geometry -- probably CT early-round control. Confirm from where it is thrown and name "
           "the cue in NOTES.")
ONE = "Each window is ONE lineup (split from the narration + title cards); return one placement."
GROUP = ("'Combo' / 'Execute' / 'Utility' / plural chapters throw SEVERAL grenades, often mixed "
         "utility -- return one placement per grenade thrown (a distinct stand spot or a distinct "
         "target). A single-utility title ('Cheetah Smoke', 'Heaven Molly') is usually ONE lineup.")

# (start, end, title, fallback utility, side note).
SOURCES = {
    "dutDQFa4cxA": {
        "author": "GettClutch", "per": 4, "group": GROUP,
        # From yt-dlp's chapter metadata. The overlay names some differently: 0-19 reads "Spawn 5
        # Utility" then "Anti Elbow", 29-44 "Lane+Long Smokes", 152-163 "A-Main Control (Spawn 5)".
        "chapters": [
            (0, 19, "T Instant Utility", "smoke", T),
            (19, 29, "Cheetah Smoke", "smoke", T),
            (29, 44, "B Smokes (Spawn)", "smoke", T),
            (44, 56, "Mid Flashes", "flash", INFER),
            (56, 63, "Early Mid Nade", "grenade", INFER),
            (63, 74, "Window Smoke+Flash", "smoke", INFER),
            (74, 84, "Heaven Molly", "molotov", INFER),
            (84, 97, "Cave Combo", "molotov", LEAN_CT),
            (97, 115, "B Execute", "smoke", T),
            (115, 129, "B Doors Smoke", "smoke", INFER),
            (129, 142, "Early Ramp Combo", "grenade", LEAN_CT),
            (142, 152, "Early Lane Combo", "grenade", LEAN_CT),
            (152, 163, "CT Instant Utility", "smoke", CT),
            (163, 172, "A Post-Plant Molly", "molotov", T),
        ],
        "source": ("GettClutch's fast utility guide: HUD mostly off, short cuts -- walk to the spot, "
                   "aim, throw, then the result, often from a second angle. The top-left overlay "
                   "repeats the chapter name; cue captions such as 'Run+Left Click Jump' / '(Crouched) "
                   "Right Click' are overlays, never events, but they state the technique."),
    },
    "x3DmUjLu0uk": {
        "author": "Tigerr", "per": 2, "group": ONE,
        "chapters": [
            (19, 74, "Mid - Red Room Smoke", "smoke", T),
            (74, 141, "Mid - Donut Smoke", "smoke", T),
            (141, 194, "Mid - Heaven Smoke", "smoke", T),
            (194, 247, "Mid - Jaguar Smoke", "smoke", T),
            (247, 333, "Mid Flash", "flash", T),
            (333, 400, "Mid - Cubby Molotov", "molotov", T),
            (400, 455, "B Site - Long Smoke", "smoke", T),
            (455, 497, "B Site - Short Smoke", "smoke", T),
            (497, 540, "B Site - Pillar Molotov", "molotov", T),
            (540, 568, "A Site - Donut Smoke", "smoke", T),
            (568, 626, "A Site - CT Smoke", "smoke", T),
            (626, 657, "A Site - Box Molotov", "molotov", T),
            (657, 702, "A Site - Temple Molotov", "molotov", T),
            (702, 756, "A Site Flash", "flash", T),
            (756, 821, "CT SIDE - Elbow Nade", "grenade", CT),
            (821, 869, "CT SIDE - Elbow Molotov", "molotov", CT),
            (869, 929, "CT SIDE - Mid Flash", "flash", CT),
            (929, 1017, "CT SIDE - B Ramp Molotov", "molotov", CT),
            (1017, 1078, "CT SIDE - B Lane Nade", "grenade", CT),
        ],
        "source": ("Tigerr's guide: a practice server with the HUD and a ROTATING minimap on, each "
                   "lineup shown as walk-to-spot, aim, throw, result, often with a grenade-cam inset "
                   "(PIP) and repeat throws / real-time replays -- match the game clock to tie a result "
                   "to its throw. A title card ('SMOKE #1' / 'MID - RED ROOM SMOKE') marks each "
                   "lineup; it is an overlay, never an event. Windows share stand spots: 1-3 are "
                   "thrown from the same T-spawn corner, 7-9 and 10-11 from one spot each."),
    },
}

CALLOUTS = (
    "Ancient. Use Ancient callouts for stand and target (T Spawn, Mid, Top Mid, Red Room, Window, "
    "Cubby, Heaven, Elbow, Donut, A Main, A Site, Temple, CT, Cave, B Ramp/B Main, B Lane, B Long, "
    "B Short, B Doors, B Site, Pillar, Cheetah, Jaguar, CT Spawn). A is the upper-LEFT site (A Main "
    "up the left), B the RIGHT site (B Ramp below it); Donut links Mid to A, Cave links Mid to B.")


def build(video, spec):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end, "ability": ability,
              "name": title, "map": "ancient", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": "ancient", "video": video, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_ANCIENT_%s.md" % video),
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
        "varNote": " ".join((CALLOUTS, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        out = os.path.join(HERE, "ancient_cs2_args_%s.json" % video)
        args = build(video, spec)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s" % (video, len(args["items"]), os.path.basename(out)))


main()
