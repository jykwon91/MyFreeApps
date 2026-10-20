"""Build workflow args (and localizer docs) for two 2026 CS2 Dust2 sources. The library's Dust2 rows all
come from one creator (Tigerr); these add a second and third view of the map.

  - NartOutHere `HY85NcZMrAg` (2026-02-28, 410s, 1080p60): "CS2 Dust 2 Smokes You NEED to Know in 2026".
    Short chapters, one smoke each. Several come in pairs, a name chapter ('Mid Door') followed by the
    same smoke ('Mid Door Smoke'); each pair is folded into ONE window so the lineup is not split.
  - GettClutch `m8-yvzJTB18` (2026-06-18, 161s, 1440p60): "New META Utility & Tricks on Dust 2". 12 short
    chapters, mostly multi-grenade combos of MIXED utility.

Chapter bounds come from yt-dlp (`dump_chapters.py`); Intro is left out. The localizer doc is derived
from the NartOutHere Ancient doc: only the source, callout and side sections are rewritten.

  python gen_cs2_dust2_args.py
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

CALLOUTS = ("T Spawn, Outside Long, Long Doors, A Long, Pit, Blue, A Site, Goose, Short/Catwalk, Mid, Top Mid, "
            "Xbox, Suicide, Mid Doors, CT Mid, Lower Tunnels, Upper Tunnels, Outside Tunnels, B Site, B Doors, "
            "B Window, Back Plat, Car, CT Spawn")

DUST2 = (
    "Dust2. Use Dust2 callouts for stand and target (%s). On the radar T Spawn is at the BOTTOM, CT Spawn "
    "top-centre, A upper RIGHT (Long up the right edge), B upper LEFT (Tunnels below it), Mid the centre "
    "lane." % CALLOUTS)

CALLOUT_BLOCK = """## Zone / side — record CALLOUTS, not fixture slugs
Use current Dust2 callouts (%s).
- T reach **A** through **Long Doors** -> **A Long**, or from **Mid** up **Short/Catwalk**. T reach **B**
  through **Upper Tunnels** (from **Outside Tunnels**), or from **Mid** via **Lower Tunnels**.
- **Mid** runs from **Top Mid** / **Xbox** (T end, **Suicide** above it) to **Mid Doors** / **CT Mid** (CT
  end). A "Mid to B" smoke blocks the **CT Mid** cross toward B; it lands at the CT end of Mid.
- **B Doors** and **B Window** are the CT entries onto **B Site**; **Back Plat** is on site.
Read the HUD minimap's location label when shown — it is the most reliable callout. Lead each of `target`
and `stand_loc` with ONE callout; put extra description after a ` - `.
- `target` = where the utility deploys; `stand_loc` = where it is thrown from.
- SIDE = **T** or **CT**. %%s Confirm from the frames and say which cue you used in NOTES.
""" % CALLOUTS

SOURCES = {
    "HY85NcZMrAg": {
        "per": 3, "pad": PAD, "dur": 410, "res": "1920x1080 @ 60fps",
        "creator": "NartOutHere", "title": "CS2 Dust 2 Smokes You NEED to Know in 2026",
        "uploaded": "2026-02-28",
        "side_rule": ("Most chapters are T-side smokes. 'Defensive', 'Retake' and 'B Tunnel From Window' "
                      "chapters are CT. 'CT' in a chapter title can name the TARGET (CT Mid), not the side."),
        "group": ("Each chapter is normally ONE smoke ('&' and 'Solo A Site Wall Smokes' throw several). "
                  "Neighbouring chapters often share a stand -- pin THIS chapter's throw."),
        "source": ("NartOutHere's smoke guide: every chapter is a SMOKE, HUD on (scoreboard, minimap location "
                   "label, round clock). A top-right section label spans several chapters and is an overlay, "
                   "never an event. Results are often drawn with a yellow grenade TRAIL and sometimes seen "
                   "from a spectator / third-person angle; the trail is never evidence of the release."),
        "chapters": [
            (43, 58, "Mid Door Smoke", "smoke", T),
            (58, 74, "Top Door Smoke", "smoke", T),
            (74, 90, "Xbox Smoke", "smoke", T),
            (90, 104, "Mid to B Smoke", "smoke", T),
            (104, 111, "Dust2 Mid to B From Cat", "smoke", T),
            (111, 119, "Dust 2 Mid to B Smoke From Door", "smoke", T),
            (119, 127, "Mid to B Smoke From Outside Tunnels", "smoke", T),
            (127, 136, "CS2 Dust2 Mid to B Smoke From Outside Tunnel", "smoke", T),
            (136, 158, "Fast Left CT Mid Smoke", "smoke", T),
            (158, 187, "B Door Smoke", "smoke", T),
            (187, 198, "B Window Smoke & B Door Smoke", "smoke", T),
            (198, 206, "Fast B door smoke", "smoke", T),
            (206, 218, "B door postplant", "smoke", T),
            (218, 227, "B Lurk", "smoke", T),
            (227, 246, "Long A Corner Smoke", "smoke", T),
            (246, 259, "Dust 2 Long A Corner Mid Round", "smoke", T),
            (259, 273, "A Cross Smoke", "smoke", T),
            (273, 280, "Dust 2 A Cross Smoke From House", "smoke", T),
            (280, 307, "Solo A Site Wall Smokes", "smoke", T),
            (307, 317, "Avangar", "smoke", T),
            (317, 333, "Fast Avangar", "smoke", T),
            (333, 344, "CT", "smoke", INFER),
            (344, 350, "Long A Door", "smoke", INFER),
            (350, 359, "Long Door", "smoke", INFER),
            (359, 377, "Defensive Long A", "smoke", CT),
            (377, 385, "B Tunnel From Window", "smoke", CT),
            (385, 392, "B Tunnel Retake", "smoke", CT),
            (392, 402, "A Retake", "smoke", CT),
            (402, 410, "Mid Door From A", "smoke", INFER),
        ],
    },
    "m8-yvzJTB18": {
        "per": 4, "pad": 2, "dur": 161, "res": "2560x1440 @ 60fps",
        "creator": "GettClutch", "title": "New META Utility & Tricks on Dust 2",
        "uploaded": "2026-06-18",
        "side_rule": ("'Mid Retake', 'CT Off-Angle' and 'B Retake Utility' are CT side; most other chapters are "
                      "T-side utility. Read each lineup's side from the footage (AK = T, M4 = CT, which spawn "
                      "it starts from)."),
        "group": ("Most chapters are a COMBO of SEVERAL grenades, often MIXED utility (smoke / flash / molotov "
                  "/ HE) -- return one placement per grenade, each with its own utility read from what "
                  "deploys."),
        "source": ("GettClutch's Dust2 guide: a practice server, each lineup shown as stand, aim, throw, "
                   "result, chapters only 6-18s long. Captions and title cards are overlays, never events. "
                   "The id contains '-': pass it as `--video=m8-yvzJTB18`."),
        "chapters": [
            (0, 17, "Fast Long Combo", "smoke", T),
            (17, 30, "Solo Mid Execute", "smoke", T),
            (30, 46, "B Smokes", "smoke", T),
            (46, 60, "Mid Big Smoke", "smoke", INFER),
            (60, 73, "Early Mid Control", "smoke", INFER),
            (73, 91, "Short Execute", "smoke", T),
            (91, 103, "Mid Retake", "smoke", CT),
            (103, 116, "Lower Tunnel Support", "smoke", INFER),
            (116, 133, "Sneaky Smoke Break", "smoke", INFER),
            (133, 139, "Long Pop Flash", "flash", T),
            (139, 146, "CT Off-Angle", "smoke", CT),
            (146, 161, "B Retake Utility", "smoke", CT),
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
                      "CS2 / Dust2 lineup localization — %s source" % spec["creator"])
    doc = doc.replace("(Ancient) lineup-localization", "(Dust2) lineup-localization")
    assert "Ancient" not in doc and "xEhS" not in doc, "template leak"
    path = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_DUST2_%s.md" % video)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(doc)
    return path


def build(video, spec, instr):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end + spec["pad"], "ability": ability,
              "name": title, "map": "dust2", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": "dust2", "video": video, "game": "cs2", "instr": instr,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the utility and/or its target; confirm the utility from what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((DUST2, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        instr = write_doc(video, spec)
        out = os.path.join(HERE, "dust2_cs2_args_%s.json" % video)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(build(video, spec, instr), fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s + %s" % (video, len(spec["chapters"]), os.path.basename(out),
                                              os.path.basename(instr)))


main()
