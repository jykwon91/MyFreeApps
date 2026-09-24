"""Build workflow args for CS2 x Inferno from GettClutch's `xBVKvESvv2U` (2026-09-01, 1080p60).

A T-side smoke guide that postdates the 2026-03-04 Inferno update. It is a second source for the
smokes MikyFPS (`1HpSjkEZK38`) covers and adds executes his guide lacks (Big Short, Bracket Long,
Mid Banana, the CT+Coffin pairs). Plural / '+' chapters throw several smokes.

  python gen_cs2_inferno_gett_args.py
"""
import json
import os

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")
VIDEO = "xBVKvESvv2U"

T = "T-side smoke guide. Report side T unless the frames plainly show CT use."

# (start, end, title) from yt-dlp's chapter metadata; the intro (0-4) and outro (280-284) are dropped.
CHAPTERS = [
    (4, 19, "Top Mid Smoke"),
    (19, 34, "Fast Top Mid Smoke"),
    (34, 63, "Mid to B Smokes"),
    (63, 93, "Arch+Library Smokes"),
    (93, 120, "Big Short Smoke"),
    (120, 138, "Bracket Long Smoke"),
    (138, 165, "Apps Lurk Smoke"),
    (165, 182, "Moto Smoke"),
    (182, 216, "Mid Banana Smoke"),
    (216, 250, "CT+Coffin V1"),
    (250, 280, "CT+Coffin V2"),
]

CALLOUTS = (
    "Inferno has two sites: B at the top of Banana, A beside Apartments, Arch and Library. Use "
    "Inferno callouts (Banana, Car, Coffins, Newbox, First/Second Box, CT, Fountain, Dark, Pit, "
    "Arch, Library, Moto, Balcony, Long, Short, Top Mid, Second Mid, Apartments, Mexico, T Spawn). "
    "This footage postdates the 2026-03-04 update: Graveyard is closed and A Balcony extended.")
SOURCE = ("GettClutch's fast T-side smoke guide: walk to the spot, aim, throw, then the smoke result. "
          "Cue captions such as 'Jump Throw' / 'Left click' are overlays, never events, but they state "
          "the technique.")


def main():
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end, "ability": "smoke",
              "name": title, "map": "inferno", "varNoteAdd": T}
             for i, (start, end, title) in enumerate(CHAPTERS)]
    args = {
        "map": "inferno", "video": VIDEO, "game": "cs2",
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_INFERNO_%s.md" % VIDEO),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": 3,
        "captions": False,
        "groupNote": "Most chapters are ONE smoke; a plural title ('Smokes') or one joining targets "
                     "with '+' throws one smoke per target -- return one placement per smoke.",
        "titleNote": "Chapter titles name the smoke's target; confirm the utility from what deploys.",
        "titleShort": "the chapter titles name the target",
        "abilities": CS2,
        "varNote": " ".join((CALLOUTS, SOURCE)),
        "items": items,
    }
    out = os.path.join(HERE, "inferno_cs2_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    print("%s: %d chapters -> %s" % (VIDEO, len(items), os.path.basename(out)))


main()
