"""Build workflow args for CS2 x Inferno from MikyFPS' `1HpSjkEZK38` (2026-03-29, 1080p60).

The library's Inferno rows are 2024 smokes that predate every Inferno update since (2025-04 Banana,
2025-07 B site, 2026-03-04 Balcony/Graveyard). This source postdates all of them and adds the
mollies, flashes and HE the library has none of. One lineup per chapter.

  python gen_cs2_inferno_args.py
"""
import json
import os

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")
VIDEO, LENGTH = "1HpSjkEZK38", 562

T = "The title tags this T-side (or it is T execute utility). Report side T unless the frames plainly show CT use."
CT = "The title tags this CT-side. Report side CT unless the frames plainly show T use."
INFER = ("The title states no side. Read it from the footage: thrown from T territory toward a site "
         "= T; anti-rush / retake utility from CT territory = CT. Name the cue in NOTES.")

# (start, title, fallback utility, side note) from yt-dlp's chapter metadata; chapter 0 (0-7s,
# untitled) is the intro. Each chapter ends where the next one starts.
CHAPTERS = [
    (7, "CT Smoke (B Site)", "smoke", T),
    (21, "Coffin Smoke", "smoke", T),
    (41, "Coffin Smoke 2", "smoke", T),
    (60, "B Site Pop Flash", "flash", T),
    (91, "Banana Pop Flash (CT)", "flash", CT),
    (113, "Banana Pop Flash (T)", "flash", T),
    (136, "Newbox/Tripple Molotov", "molotov", T),
    (154, "First & Second Box Molotov", "molotov", T),
    (187, "Banana Car Molotov", "molotov", INFER),
    (204, "Long Corner Smoke", "smoke", T),
    (221, "Moto Smoke", "smoke", T),
    (247, "Long Corner Smoke 2 (From Mexico)", "smoke", T),
    (268, "Moto Smoke 2 (From Mexico)", "smoke", T),
    (292, "Library Smoke", "smoke", T),
    (316, "Arch Smoke", "smoke", T),
    (337, "Top Mid Smoke", "smoke", T),
    (359, "Apartments Lurk Smoke", "smoke", T),
    (381, "Apartments Pop Flash (CT)", "flash", CT),
    (399, "Short Flash (CT)", "flash", CT),
    (417, "Long Flash (CT)", "flash", CT),
    (443, "Short Flash (T)", "flash", T),
    (461, "A Site Flash", "flash", T),
    (490, "A Site Flash (From Apartmants)", "flash", T),
    (511, "Second Mid Apartmants Molotov", "molotov", INFER),
    (526, "Banana Cubby Grenade", "grenade", INFER),
    (540, "Apartmants Anti Rush Molotov", "molotov", CT),
]

CALLOUTS = (
    "Inferno has two sites: B at the top of Banana, A beside Apartments, Arch and Library. Use "
    "Inferno callouts (Banana, Car, Coffins, Newbox, First/Second Box, CT, Fountain, Dark, Pit, "
    "Arch, Library, Moto, Balcony, Long, Short, Top Mid, Second Mid, Apartments, Mexico, T Spawn). "
    "This footage postdates the 2026-03-04 update: Graveyard is closed and A Balcony extended.")
SOURCE = ("A practice server with the HUD and minimap on. The creator shows cue captions such as "
          "'Jump Throw' / 'Left click' -- overlays, never events, but they state the technique.")


def main():
    items = []
    for i, (start, title, ability, note) in enumerate(CHAPTERS):
        end = CHAPTERS[i + 1][0] if i + 1 < len(CHAPTERS) else LENGTH
        items.append({"nn": "%02d" % (i + 1), "cs": start, "next": end, "ability": ability,
                      "name": title, "map": "inferno", "varNoteAdd": note})
    args = {
        "map": "inferno", "video": VIDEO, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_INFERNO_MIKY.md"),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": 2,
        "captions": False,
        "groupNote": "Each chapter on this source is ONE lineup; a survey should normally return "
                     "exactly one placement per chapter.",
        "titleNote": "Chapter titles name the utility and its target; confirm the utility from "
                     "what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((CALLOUTS, SOURCE)),
        "items": items,
    }
    out = os.path.join(HERE, "inferno_cs2_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    print("%s: %d chapters -> %s" % (VIDEO, len(items), os.path.basename(out)))


main()
