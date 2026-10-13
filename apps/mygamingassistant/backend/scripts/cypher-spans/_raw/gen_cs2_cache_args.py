"""Build workflow args (and localizer docs) for two 2026 CS2 Cache sources. The library's Cache rows all
come from one creator (NartOutHere); these add a second and third view of the remastered map.

  - Tigerr `z2OtECDTxFI` (2026-06-24, 883s, 1440p): "Cache utility guide". Area chapters, five CT-side
    then seven T-side, each one or several lineups of MIXED utility. Intro / Outro are left out.
  - GettClutch `_PQZiwcdZt4` (2026-07-08, 165s, 1440p): 14 short chapters, mostly one lineup each;
    'A Main Combo', 'A Waterfall Smokes', 'B Smokes+Flash', 'Whitebox Molly+Nade', 'Tree Smoke+HS Molly'
    and 'B Execute' throw several.

Chapter bounds come from yt-dlp (`dump_chapters.py`). The localizer doc is derived from the NartOutHere
Ancient doc: only the source, callout and side sections are rewritten.

  python gen_cs2_cache_args.py
"""

import json
import os
import re

from cs2_utilities import CS2

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")
TEMPLATE = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_ANCIENT_xEhS-AmIzIw.md")
PAD = 3

T = "T-side utility. Report side T unless the frames plainly show CT use."
CT = "CT-side utility. Report side CT unless the frames plainly show T use."
INFER = ("The title states no side. Read it from the footage: thrown from T territory toward a site "
         "= T; anti-rush / retake utility from CT territory = CT. The POV rifle helps (AK = T, "
         "M4 = CT). Name the cue in NOTES.")

CALLOUTS = ("A Site, A Main, Squeaky, Highway, Quad, Forklift, Balcony, Truck, Mid, Garage, Boost, White Box, "
            "Connector, Sandbags, Vents, Checkers, B Site, B Main, B Halls, Sun Room, Headshot, Heaven, Tree, "
            "Hell, T Spawn, CT Spawn")

CACHE = (
    "Cache. Use Cache callouts for stand and target (%s). On the radar A is at the TOP, B at the BOTTOM, "
    "T Spawn on the right, CT Spawn on the left. Tree and Heaven are on B." % CALLOUTS)

CALLOUT_BLOCK = """## Zone / side — record CALLOUTS, not fixture slugs
Use current Cache callouts (%s).
- Three lanes. T reach **A** through **A Main** or the long route via **Squeaky**, and from **Mid** up
  **Highway**. **Mid** runs from **Garage** (T end) to **White Box** / **Connector** (CT end); **Vents** drop
  from Mid to **Checkers** under B. T reach **B** through **B Halls** / **B Main**, with **Sun Room** off it.
- **Tree**, **Hell** and **Heaven** are on the CT side of **B** (Tree is NOT at A). **Connector** is the CT
  entry to Mid, not Vents. **Garage** is Mid, not A.
Read the HUD minimap's location label when shown — it is the most reliable callout. Lead each of `target`
and `stand_loc` with ONE callout; put extra description after a ` - `.
- `target` = where the utility deploys; `stand_loc` = where it is thrown from.
- SIDE = **T** or **CT**. %%s Confirm from the frames and say which cue you used in NOTES.
""" % CALLOUTS

SOURCES = {
    "z2OtECDTxFI": {
        "per": 6, "pad": 0, "dur": 883, "res": "2560x1440",
        "creator": "Tigerr", "title": "Cache utility guide",
        "uploaded": "2026-06-24",
        "side_rule": ("Chapters titled 'CT Side - ...' are CT side; the other chapters are T-side utility unless "
                      "the footage plainly shows CT use (AK = T, M4 = CT)."),
        "group": ("Each chapter is an AREA: one or SEVERAL lineups, of MIXED utility (smoke / flash / molotov "
                  "/ HE) -- return one placement per grenade thrown, each with its own utility read from "
                  "what deploys."),
        "source": ("Tigerr's utility guide: a practice server with the HUD and minimap on, each lineup shown as "
                   "walk-to-spot, aim, throw, result, often with a grenade-cam inset (PIP) and repeat throws -- "
                   "match the game clock to tie a result to its throw. A title card naming the lineup marks "
                   "each one; it is an overlay, never an event."),
        "chapters": [
            (42, 62, "CT Side - Easy Mid Smoke", "smoke", CT),
            (62, 108, "CT Side - Mid Smoke From Spawn", "smoke", CT),
            (108, 183, "CT Side - Boost Molotov", "molotov", CT),
            (183, 238, "CT Side - A Main Smoke", "smoke", CT),
            (238, 305, "CT Side - B Main Smoke", "smoke", CT),
            (305, 402, "Mid Smoke From Spawn", "smoke", T),
            (402, 454, "A Site Molotovs", "molotov", T),
            (454, 533, "A Site Pop Flash", "flash", T),
            (533, 649, "A Site Smokes", "smoke", T),
            (649, 734, "B Site Smokes", "smoke", T),
            (734, 796, "B Site Molotovs", "molotov", T),
            (796, 856, "B Site Pop Flash", "flash", T),
        ],
    },
    "_PQZiwcdZt4": {
        "per": 4, "pad": 2, "dur": 165, "res": "2560x1440",
        "creator": "GettClutch", "title": "Cache utility guide",
        "uploaded": "2026-07-08",
        "side_rule": ("'A Main Retake' and 'Mid Control (CT)' are CT side; most other chapters are T-side "
                      "execute utility. Read each lineup's side from the footage (AK = T, M4 = CT, which spawn "
                      "it starts from)."),
        "group": ("Most chapters are ONE lineup. 'A Main Combo', 'A Waterfall Smokes', 'B Smokes+Flash', "
                  "'Whitebox Molly+Nade', 'Tree Smoke+HS Molly' and 'B Execute' throw SEVERAL, often MIXED "
                  "utility -- return one placement per grenade, each with its own utility."),
        "source": ("GettClutch's Cache guide: a practice server, each lineup shown as stand, aim, throw, "
                   "result, chapters only 8-16s long. Captions and title cards are overlays, never events."),
        "chapters": [
            (0, 16, "A Main Retake", "smoke", CT),
            (16, 32, "Mid Control (T)", "smoke", T),
            (32, 42, "Sandbag Molly", "molotov", INFER),
            (42, 51, "Fast Connector Smoke", "smoke", T),
            (51, 59, "Whitebox Molly+Nade", "molotov", INFER),
            (59, 67, "Under Boost Molly", "molotov", T),
            (67, 79, "Vent Molly", "molotov", INFER),
            (79, 94, "A Main Combo", "smoke", T),
            (94, 105, "Fast A Cross Smoke", "smoke", T),
            (105, 118, "A Waterfall Smokes", "smoke", T),
            (118, 132, "B Smokes+Flash", "smoke", T),
            (132, 144, "Tree Smoke+HS Molly", "smoke", T),
            (144, 156, "B Execute", "smoke", T),
            (156, 165, "Mid Control (CT)", "smoke", CT),
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
        "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\%s.mp4` (%s, %ds)\n"
        "- Creator: **%s**, \"%s\", uploaded %s. Read the geometry you\n"
        "  see, not a remembered layout.\n"
        "- %s\n"
        "- %s\n"
        "- On-screen cue captions (`Jump Throw`, `Run Throw`, `Right Click`) are overlays, never events, but they\n"
        "  STATE the technique: report it and say so in NOTES.\n"
        "- Pass `%s` to EVERY frame_study.py / verify_events.py call (the `=` form, so an id containing\n"
        "  `-` is never read as a flag).\n\n"
    ) % (video, spec["res"], spec["dur"], spec["creator"], spec["title"], spec["uploaded"],
         spec["source"], spec["group"], flag)
    doc = head + source + "## The 4 events" + tail
    doc = re.sub(r"## Zone / side.*?(?=## Honesty contract)", lambda _m: CALLOUT_BLOCK % spec["side_rule"] + "\n",
                 doc, flags=re.S)
    doc = doc.replace("CS2 / Ancient lineup localization — NartOutHere source",
                      "CS2 / Cache lineup localization — %s source" % spec["creator"])
    doc = doc.replace("(Ancient) lineup-localization", "(Cache) lineup-localization")
    assert "Ancient" not in doc and "xEhS" not in doc, "template leak"
    path = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_CACHE_%s.md" % video)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(doc)
    return path


def build(video, spec, instr):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end + spec["pad"], "ability": ability,
              "name": title, "map": "cache", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": "cache", "video": video, "game": "cs2", "instr": instr,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the utility and/or its target; confirm the utility from what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((CACHE, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        instr = write_doc(video, spec)
        out = os.path.join(HERE, "cache_cs2_args_%s.json" % video)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(build(video, spec, instr), fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s + %s" % (video, len(spec["chapters"]), os.path.basename(out),
                                              os.path.basename(instr)))


main()
