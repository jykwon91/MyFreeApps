"""Build workflow args (and localizer docs) for the two post-rework CS2 Inferno sources that replace
NartOutHere `2pSqBc6M10s` (2025) -- whose A-side rows predate the 2026-03-04 Inferno A-site rework.

  - Milosh0vskY `5y43zuQjGSc` (2026-09-11, 419s, 1080p): "The *BEST* Inferno Smokes In 2026!!! (T Side)".
    One T smoke per chapter except the 'X & Y' / 'From 1 Pos' chapters, which throw two.
  - GettClutch `-kthqL2Rnc0` (2026-09-05, 298s, 1080p): "CS2 Inferno - A-Site Retake Utility You NEED to
    Know". Three long CT-side chapters, each several mixed grenades thrown from one entrance; the 'Full
    ... Retake' chapters only replay them together and are left out.

Chapter bounds come from yt-dlp (`dump_chapters.py`); Intro/Outro are left out. The localizer doc is
derived from the NartOutHere Ancient doc: only the source, callout and side sections are rewritten.
A video id starting with '-' is passed as `--video=<id>` so argparse doesn't read it as a flag.

  python gen_cs2_inferno_args.py
"""
import json
import os
import re

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")
TEMPLATE = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_ANCIENT_xEhS-AmIzIw.md")

T = "T-side utility. Report side T unless the frames plainly show CT use."
CT = "CT-side retake utility. Report side CT unless the frames plainly show T use."

INFERNO = (
    "Inferno after the 2026-03-04 A-site rework. Use Inferno callouts for stand and target (T Spawn, "
    "T Ramp, Second Mid, Mid, Top Mid, Under Boiler, Boiler, Mexico, Apartments (Apps), Balcony, Short, "
    "Long, Pit, Graveyard, Library, Arch, Moto, A Site, Truck, CT, Banana, Car, Sandbags, Ruins, B Site, "
    "Dark, New Box, Coffins, Construction, Fountain, CT Spawn). A is the upper-RIGHT site (Long, Short and "
    "Apps lead onto it), B the upper-LEFT site at the top of Banana.")

CALLOUT_BLOCK = """## Zone / side — record CALLOUTS, not fixture slugs
Use current Inferno callouts (after the 2026-03-04 A-site rework). Map geometry (radar: T spawn at the
bottom-left, CT spawn at the top-right):
- **A** is the RIGHT site. T routes onto A: **Mid** (T Ramp -> Second Mid -> Mid -> Top Mid, with Under
  Boiler / Boiler and Mexico beside it), **Apartments (Apps)** (upstairs, ending at Balcony over A), **Short**
  (from Top Mid, the steps onto A) and **Long** (from Mid, the lane along the right edge past Pit). On and
  around A: Pit (below Long), Graveyard, Truck, Library (the room at the back of A), Arch (the CT-side
  passage behind A toward CT), Moto (the corner by the Arch/Library entry). CT enters A through Arch/Library.
- **B** is the upper-LEFT site at the top of **Banana** (Car, Sandbags, Half Wall on the way up). On B: Dark,
  New Box, Coffins, Fountain, Construction; CT reaches B through **Ruins** from CT Spawn.
Callout list: T Spawn, T Ramp, Second Mid, Mid, Top Mid, Under Boiler, Boiler, Mexico, Apartments, Balcony,
Short, Long, Pit, Graveyard, Library, Arch, Moto, A Site, Truck, CT, Banana, Car, Sandbags, Ruins, B Site,
Dark, New Box, Coffins, Construction, Fountain, CT Spawn.
Read the HUD minimap's location label when shown — it is the most reliable callout. Lead each of `target` and
`stand_loc` with ONE callout; put extra description after a ` - `.
- `target` = where the utility deploys; `stand_loc` = where it is thrown from.
- SIDE = **T** or **CT**. %s Confirm from the frames and say which cue you used in NOTES.
"""

SOURCES = {
    "5y43zuQjGSc": {
        "stem": "INFERNO", "per": 3, "pad": 3,
        "creator": "Milosh0vskY", "title": "The *BEST* Inferno Smokes In 2026!!! (T Side)",
        "uploaded": "2026-09-11", "dur": 419,
        "side_rule": ("Every chapter is a T-side SMOKE (the title says T Side). 'CT' in a chapter title "
                      "names the TARGET (the CT entrance onto A), not the side."),
        "group": ("Each chapter is normally ONE smoke. 'X & Y' chapters ('Arch & Library', 'Short & Split', "
                  "'Long & Moto', 'CT & Ruins From 1 Pos') throw TWO -- return one placement per smoke."),
        "source": ("Milosh0vskY's T-side smoke guide: every chapter is a SMOKE, usually walk-to-spot, aim, "
                   "throw, then the result. Chapter titles name the TARGET ('Motto' = Moto) and sometimes "
                   "the stand ('From Mid', 'Under Boiler', '2nd Mid', 'From Mexico'). Any title card, "
                   "arrow or caption is an overlay, never an event. Neighbouring chapters often share a "
                   "stand -- pin THIS chapter's throw."),
        "chapters": [
            (4, 30, "Banana Smoke", "smoke", T),
            (30, 51, "Top Mid Smoke", "smoke", T),
            (51, 77, "B Rush Smoke", "smoke", T),
            (77, 114, "Ruins Rush Smoke", "smoke", T),
            (114, 152, "Short & Split Smoke", "smoke", T),
            (152, 197, "Long & Moto Rush", "smoke", T),
            (197, 230, "Arch & Library 2nd Mid", "smoke", T),
            (230, 243, "Long From Under Boiler", "smoke", T),
            (243, 263, "Arch & Library Under Boiler", "smoke", T),
            (263, 282, "Arch & Library From Mid", "smoke", T),
            (282, 297, "Motto From Mid", "smoke", T),
            (297, 319, "Long From Mexico", "smoke", T),
            (319, 347, "CT & Ruins From 1 Pos", "smoke", T),
            (347, 362, "Normal CT Smoke", "smoke", T),
            (362, 388, "Ruins Smoke", "smoke", T),
            (388, 419, "APS Lurk Smoke", "smoke", T),
        ],
    },
    "-kthqL2Rnc0": {
        "stem": "INFERNO", "per": 6, "pad": 0,
        "creator": "GettClutch", "title": "CS2 Inferno - A-Site Retake Utility You NEED to Know",
        "uploaded": "2026-09-05", "dur": 298,
        "side_rule": ("Every chapter is CT-side RETAKE utility onto A, thrown from the entrance the chapter "
                      "names (Short, Apps, Long) -- all side CT."),
        "group": ("Each chapter throws SEVERAL grenades of MIXED type (smoke / flash / molotov / HE) from one "
                  "entrance -- return one placement per grenade thrown, each with its own ability."),
        "source": ("GettClutch's A-retake guide: a practice server, each grenade shown as stand, aim, throw, "
                   "result, with the grenade type read off the HUD / viewmodel. Chapter titles name the "
                   "ENTRANCE the utility is thrown from ('Utility From Short/Apps/Long'); the target is "
                   "on or around A Site. Captions and title cards are overlays, never events. The video "
                   "id starts with '-': ALWAYS pass it as `--video=-kthqL2Rnc0` (with '='), never "
                   "`--video -kthqL2Rnc0`."),
        "chapters": [
            (3, 94, "Utility From Short", "smoke", CT),
            (116, 169, "Utility From Apps", "smoke", CT),
            (186, 265, "Utility From Long", "smoke", CT),
        ],
    },
}


def write_doc(video, spec):
    with open(TEMPLATE, encoding="utf-8") as fh:
        doc = fh.read()
    flag = "--video=%s" % video
    doc = doc.replace("--video xEhS-AmIzIw", flag)
    head, rest = doc.split("## Source\n", 1)
    _, tail = rest.split("## The 4 events", 1)
    source = (
        "## Source\n"
        "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\%s.mp4` (1080p, %ds)\n"
        "- Creator: **%s**, \"%s\", uploaded %s — after the 2026-03-04 Inferno A-site rework. Read the\n"
        "  geometry you see.\n"
        "- %s\n"
        "- %s\n"
        "- On-screen cue captions (`Jump Throw`, `Run Throw`, `Right Click`) are overlays, never events, but they\n"
        "  STATE the technique: report it and say so in NOTES.\n"
        "- Pass `%s` to EVERY frame_study.py / verify_events.py call (the `=` form, so an id starting\n"
        "  with `-` is not read as a flag).\n\n"
    ) % (video, spec["dur"], spec["creator"], spec["title"], spec["uploaded"], spec["source"],
         spec["group"], flag)
    doc = head + source + "## The 4 events" + tail
    doc = re.sub(r"## Zone / side.*?(?=## Honesty contract)", lambda _m: CALLOUT_BLOCK % spec["side_rule"] + "\n",
                 doc, flags=re.S)
    doc = doc.replace("CS2 / Ancient lineup localization — NartOutHere source",
                      "CS2 / Inferno lineup localization — %s source" % spec["creator"])
    doc = doc.replace("(Ancient) lineup-localization", "(Inferno) lineup-localization")
    assert "Ancient" not in doc and "xEhS" not in doc and "NartOutHere" not in doc, "template leak"
    path = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_%s_%s.md" % (spec["stem"], video))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(doc)
    return path


def build(video, spec, instr):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end + spec["pad"], "ability": ability,
              "name": title, "map": "inferno", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": "inferno", "video": video, "game": "cs2", "instr": instr,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the target and/or stand; confirm the utility from what deploys.",
        "titleShort": "the chapter titles name the target",
        "abilities": CS2,
        "varNote": " ".join((INFERNO, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        instr = write_doc(video, spec)
        out = os.path.join(HERE, "inferno_cs2_args_%s.json" % video)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(build(video, spec, instr), fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s + %s" % (video, len(spec["chapters"]), os.path.basename(out),
                                              os.path.basename(instr)))


main()
