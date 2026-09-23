"""Build workflow args for CS2 x Anubis from two post-rework sources.

The library's Anubis rows predate the 2026-01-22 rework. Both sources here postdate it AND the
2026-04-21 AnimGraph2 throw change:
  - Tigerr `g1jYVHvj2w8` (2026-07-08, 707s): grouped chapters, several lineups per chapter.
  - Komino `SGJbL7_pqAU` (2026-07-26, 169s): one or a few lineups per short chapter.

  python gen_cs2_anubis_args.py
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

# (start, title, fallback utility, side note); each chapter ends where the next starts.
SOURCES = {
    "g1jYVHvj2w8": {
        "author": "Tigerr", "length": 667, "per": 4,
        "chapters": [
            (51, "Mid Smokes", "smoke", T),
            (132, "Mid Window Molotov", "molotov", T),
            (190, "Mid Window Nade", "grenade", T),
            (238, "B Site Smokes", "smoke", T),
            (322, "B Site E-Box Molotov", "molotov", T),
            (351, "B Site Pop Flash", "flash", T),
            (413, "A Site Smokes", "smoke", T),
            (484, "A Site Pop Flash", "flash", T),
            (556, "A Site Platform Molotov", "molotov", T),
            (601, "Mid Camera and Temple Smokes", "smoke", T),
        ],
        "source": ("Tigerr's guide: a practice server with the HUD and minimap on, several lineups per "
                   "chapter, each usually shown as walk-to-spot, aim, throw, result."),
        "group": ("Chapters GROUP several lineups (e.g. 'Mid Smokes'). Return one placement per "
                  "distinct lineup thrown -- a distinct stand spot or a distinct target."),
    },
    "SGJbL7_pqAU": {
        "author": "Komino", "length": 169, "per": 3,
        "chapters": [
            (0, "2 Smoke on A", "smoke", T),
            (19, "3 Smoke on site B", "smoke", T),
            (38, "Smoke on Connector", "smoke", T),
            (50, "Smoke for the Market", "smoke", INFER),
            (64, "Alternative Smoke for Mid", "smoke", T),
            (76, "Smoke on House (Mid)", "smoke", T),
            (92, "CT smoke for T stairs", "smoke", CT),
            (103, "Smoke on A Main", "smoke", CT),
            (112, "Molotov and Grenade Mid", "molotov", INFER),
            (121, "Molotov from Connector Ninja", "molotov", INFER),
            (130, "Flash from Backsite", "flash", CT),
            (140, "Flash from CT to B", "flash", CT),
            (149, "Flash from the Water", "flash", T),
            (160, "Flash from Upper to Market", "flash", INFER),
        ],
        "source": ("Komino's fast compilation: short cuts, one lineup per chapter unless the title "
                   "counts more ('2 Smoke on A', '3 Smoke on site B', 'Molotov and Grenade Mid'). "
                   "Little walking footage -- the STAND may be the first settled frames at the spot."),
        "group": ("Most chapters are ONE lineup; a title that counts N utilities ('2 Smoke', '3 Smoke', "
                  "'Molotov and Grenade') holds N placements."),
    },
}

CALLOUTS = (
    "Anubis after the 2026-01-22 rework. Use Anubis callouts for stand and target (A Main, A Site, "
    "Heaven, Camera, Platform, B Main, B Site, E-Box, Pillar, Temple, Mid, Mid Window, House, "
    "Connector, Canal/Water, Bridge, Street, T Spawn, CT Spawn, Backsite).")


def build(video, spec):
    items = []
    chapters = spec["chapters"]
    for i, (start, title, ability, note) in enumerate(chapters):
        end = chapters[i + 1][0] if i + 1 < len(chapters) else spec["length"]
        items.append({"nn": "%02d" % (i + 1), "cs": start, "next": end, "ability": ability,
                      "name": title, "map": "anubis", "varNoteAdd": note})
    return {
        "map": "anubis", "video": video, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_ANUBIS_%s.md" % video),
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
        "varNote": " ".join((CALLOUTS, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        out = os.path.join(HERE, "anubis_cs2_args_%s.json" % video)
        args = build(video, spec)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s" % (video, len(args["items"]), os.path.basename(out)))


main()
