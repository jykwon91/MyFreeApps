"""Build workflow args for CS2 Nuke, Dust2 and Mirage from 2026 sources.

  - k1ss `y_bSh_OiGho` (Nuke, 2026-09-01, 468s): full-utility guide, T executes + CT defense.
  - Tigerr `Skh6cMwNyCQ` (Dust2, 2026-06-17, 961s): same format as his Anubis guide; CT SIDE tagged.
  - CS2 NADES `SvKwHEe-FNc` (Mirage, 2026-06-02, 154s, 30fps): Vitality flashes, one per chapter.
  - CS Tactics `K3JbrpkoE8I` (Mirage, 2026-05-27, 428s): 10 flashes in three grouped chapters.

  python gen_cs2_nuke_dust2_mirage_args.py
"""
import json
import os

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

T = "T-side execute utility. Report side T unless the frames plainly show CT use."
CT = "CT-side utility. Report side CT unless the frames plainly show T use."
INFER = ("The title states no side. Read it from the footage: thrown from T territory toward a site "
         "= T; anti-rush / retake utility from CT territory = CT. Name the cue in NOTES.")
ONE = "Most chapters are ONE lineup; a title that counts N utilities or says 'nades' may hold several."
GROUP = ("Chapters GROUP several lineups. Return one placement per distinct lineup thrown -- a "
         "distinct stand spot or a distinct target.")

# (start, title, fallback utility, side note); each chapter ends where the next starts. Intros,
# outros and sponsor segments are left out -- the chapter before a gap ends at the gap's start.
SOURCES = {
    "y_bSh_OiGho": {
        "map": "nuke", "author": "k1ss", "per": 3, "group": ONE,
        "chapters": [
            (11, "Outside Smokes", "smoke", T),
            (51, "Hut molly", "molotov", INFER),
            (72, "A Site GOD FLASH", "flash", INFER),
            (105, "Ramp GOD FLASH", "flash", INFER),
            (180, "Flash out of heaven", "flash", CT),
            (205, "Control Room Flash", "flash", INFER),
            (234, "Ramp defense nades", "grenade", CT),
            (282, "Outside defense nades", "grenade", CT),
            (345, "Obscure outside heaven smoke for secret cross", "smoke", INFER),
            (385, "Outside flash", "flash", INFER),
        ],
        "ends": {385: 468},
        "source": ("k1ss's guide: HUD and minimap on; 'defense nades' chapters show several CT "
                   "utilities (molotov / HE / smoke) -- confirm each from what deploys."),
    },
    "Skh6cMwNyCQ": {
        "map": "dust2", "author": "Tigerr", "per": 3, "group": ONE,
        "chapters": [
            (21, "X-Box Smoke", "smoke", T),
            (89, "Mid Doors Smoke", "smoke", T),
            (157, "Mid to B Smoke", "smoke", T),
            (267, "B Site - Mid Site Molotov", "molotov", T),
            (366, "B Site - Site Flash", "flash", T),
            (440, "B Site - Back Site Molotov", "molotov", T),
            (474, "B Site - Door Smoke From Spawn", "smoke", T),
            (555, "A Site - Long Flash", "flash", T),
            (604, "A Site - Cross Smoke", "smoke", T),
            (653, "A Site - Mid Site Molotov", "molotov", T),
            (718, "CT SIDE - Mid Cross Nade", "grenade", CT),
            (781, "CT SIDE - Long Doors Smoke", "smoke", CT),
            (824, "CT SIDE - Long Doors Molotov", "molotov", CT),
            (858, "CT SIDE - Mid Smoke Break Nade", "grenade", CT),
            (890, "CT SIDE - Mid Flash", "flash", CT),
        ],
        "ends": {890: 942},
        "source": ("Tigerr's guide: a practice server with the HUD and minimap on, each lineup shown "
                   "as walk-to-spot, aim, throw, result, often with a grenade-cam inset (PIP) and "
                   "later result replays -- match the game clock to tie a result to its throw."),
    },
    "SvKwHEe-FNc": {
        "map": "mirage", "author": "CS2 NADES", "per": 2, "group": ONE,
        "chapters": [
            (0, "Mid Self Pop Flash", "flash", INFER),
            (12, "Window Flash", "flash", INFER),
            (66, "Short Flash", "flash", INFER),
            (78, "Mid Flash V2", "flash", INFER),
            (90, "A Site Retake Flash", "flash", CT),
            (102, "Connector Flash", "flash", INFER),
            (111, "Retake A Site Flash", "flash", CT),
            (121, "Pit Flash", "flash", INFER),
            (129, "Market Doors Flash", "flash", INFER),
            (137, "CT Flash", "flash", INFER),
        ],
        "ends": {12: 25, 137: 154},
        "source": ("CS2 NADES' Vitality flash compilation (30fps): short cuts, one flash per chapter; "
                   "25-66s is a sponsor segment, never a lineup."),
    },
    "K3JbrpkoE8I": {
        "map": "mirage", "author": "CS Tactics", "per": 5, "group": GROUP,
        "chapters": [
            (23, "A-Site Flashes", "flash", INFER),
            (156, "B-Site Flashes", "flash", INFER),
            (218, "Mid Flashes", "flash", INFER),
        ],
        "ends": {218: 380},
        "source": ("CS Tactics' '10 MUST KNOW Flashes on Mirage': several flashes per chapter, each "
                   "shown as the lineup then the result."),
    },
}

CALLOUTS = {
    "nuke": ("Nuke. Use Nuke callouts for stand and target (Outside, Garage, Secret, Mini, Silo, "
             "Heaven, Hut, Squeaky, Lobby, Radio, Ramp, Rafters, A Site, B Site, Vents, Control Room, "
             "Decon, Main, T Roof, T Spawn, CT Spawn). A is the UPPER site, B the LOWER site."),
    "dust2": ("Dust2. Use Dust2 callouts for stand and target (Long Doors, A Long, Pit, A Site, "
              "Short/Catwalk, Goose, Cross, Mid, Mid Doors, Xbox, Suicide, Top Mid, Lower Tunnels, "
              "Upper Tunnels, B Site, B Doors, B Window, Back Plat, T Spawn, CT Spawn)."),
    "mirage": ("Mirage. Use Mirage callouts for stand and target (A Ramp, Palace, Tetris, Sandwich, "
               "Firebox, Triple, Stairs, Jungle, Connector, Ticket Booth, CT, A Site, Top Mid, Mid, "
               "Window, Short/Catwalk, Underpass, Apartments, B Short, Market, Kitchen, Van, Bench, "
               "B Site, T Spawn, CT Spawn)."),
}


def build(video, spec):
    items = []
    chapters = spec["chapters"]
    for i, (start, title, ability, note) in enumerate(chapters):
        end = spec["ends"].get(start) or chapters[i + 1][0]
        items.append({"nn": "%02d" % (i + 1), "cs": start, "next": end, "ability": ability,
                      "name": title, "map": spec["map"], "varNoteAdd": note})
    return {
        "map": spec["map"], "video": video, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_%s_%s.md" % (spec["map"].upper(), video)),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the utility and its target; confirm the utility from "
                     "what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((CALLOUTS[spec["map"]], spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        out = os.path.join(HERE, "%s_cs2_args_%s.json" % (spec["map"], video))
        args = build(video, spec)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
        print("%s %s: %d chapters -> %s" % (spec["map"], video, len(args["items"]), os.path.basename(out)))


main()
