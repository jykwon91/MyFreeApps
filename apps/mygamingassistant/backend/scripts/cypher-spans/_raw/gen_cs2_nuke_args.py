"""Build workflow args (and localizer docs) for two 2026 CS2 Nuke sources that fill the library's thin
flash (7) and molotov (6) coverage.

  - GettClutch `hPFae0bNUFk` (2026-07-22, 209s, 1440p60): "New META Utility & Tricks on Nuke". 15 short
    chapters, mostly one lineup each; 'A Solo Execute', 'Split Main Utility', 'More Outside Utility',
    'Outside Smokes', 'Secret Cross Smokes' and 'Ramp Molly+Flash' throw several.
  - Tigerr `i9a8FcZ63Es` (2026-07-15, 763s, 1440p60): "MUST KNOW Nuke Utility for Free Elo". Area
    chapters, each several lineups of MIXED utility. Intro / Sponsor / BONUS TIP / Outro are left out.

Chapter bounds come from yt-dlp (`dump_chapters.py`). The localizer doc is derived from the NartOutHere
Ancient doc: only the source, callout and side sections are rewritten.

  python gen_cs2_nuke_args.py
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

NUKE = (
    "Nuke. Use Nuke callouts for stand and target (Outside, Garage, Secret, Mini, Silo, Heaven, Hut, "
    "Top Hut, Squeaky, Lobby, Radio, Ramp, Rafters, A Site, B Site, Vents, Control Room, Decon, Main, "
    "Red, Locker, T Roof, T Spawn, CT Spawn). Nuke is vertical: A is the UPPER site, B the LOWER site.")

CALLOUT_BLOCK = """## Zone / side — record CALLOUTS, not fixture slugs
Use current Nuke callouts (Outside, Garage, Secret, Mini, Silo, Heaven, Hut, Top Hut, Squeaky, Lobby, Radio,
Ramp, Rafters, A Site, B Site, Vents, Control Room, Decon, Main, Red, Locker, T Roof, T Spawn, CT Spawn).
- Nuke is VERTICAL: **A** is the UPPER site (inside the main building, reached by T from **Lobby** / **Squeaky**
  / **Hut** and from **Outside** via Heaven's windows), **B** the LOWER site under it (reached by **Ramp**,
  **Vents** from A, and **Secret** from Outside).
- **Outside** is the big yard between T side and CT; **Mini**, **Garage**, **Silo** and **Red** sit around it.
Read the HUD minimap's location label when shown — it is the most reliable callout. Lead each of `target`
and `stand_loc` with ONE callout; put extra description after a ` - `.
- `target` = where the utility deploys; `stand_loc` = where it is thrown from.
- SIDE = **T** or **CT**. %s Confirm from the frames and say which cue you used in NOTES.
"""

SOURCES = {
    "hPFae0bNUFk": {
        "per": 5, "pad": 2, "dur": 209, "res": "2560x1440 @ 60fps",
        "creator": "GettClutch", "title": "New META Utility & Tricks on Nuke",
        "uploaded": "2026-07-22",
        "side_rule": ("Almost every chapter is T-side execute / lurk utility. Read each lineup's side from the "
                      "footage (AK = T, M4 = CT, which spawn it starts from)."),
        "group": ("Most chapters are ONE lineup. 'Outside Smokes', 'Secret Cross Smokes', 'A Solo Execute', "
                  "'Split Main Utility', 'More Outside Utility' and 'Ramp Molly+Flash' throw SEVERAL, often "
                  "MIXED utility -- return one placement per grenade, each with its own utility."),
        "source": ("GettClutch's Nuke guide: a practice server, each lineup shown as stand, aim, throw, "
                   "result, chapters only 7-22s long. Captions and title cards are overlays, never events."),
        "chapters": [
            (0, 20, "Heaven Smoke", "smoke", T),
            (20, 42, "Outside Smokes", "smoke", T),
            (42, 57, "Secret Cross Smokes", "smoke", T),
            (57, 70, "Locker Room Smoke", "smoke", T),
            (70, 84, "Squeaky Lurk Smoke", "smoke", T),
            (84, 93, "Top Hut Molly", "molotov", T),
            (93, 113, "A Solo Execute", "smoke", T),
            (113, 126, "A Backsite Nade", "grenade", T),
            (126, 133, "Squeaky Pop Flash", "flash", T),
            (133, 140, "Vent Pop Flash", "flash", T),
            (140, 155, "Red Molly", "molotov", INFER),
            (155, 169, "Split Main Utility", "smoke", T),
            (169, 183, "More Outside Utility", "smoke", T),
            (183, 196, "Ramp Molly+Flash", "molotov", T),
            (196, 209, "Ramp Flash (Smoked)", "flash", T),
        ],
    },
    "i9a8FcZ63Es": {
        "per": 10, "pad": 0, "dur": 763, "res": "2560x1440 @ 60fps",
        "creator": "Tigerr", "title": "MUST KNOW Nuke Utility for Free Elo | Nuke Utility Guide",
        "uploaded": "2026-07-15",
        "side_rule": ("'CT Side - Outside Utility' is CT side; the other chapters are T-side utility unless "
                      "the footage plainly shows CT use (AK = T, M4 = CT)."),
        "group": ("Each chapter is an AREA: one or SEVERAL lineups, of MIXED utility (smoke / flash / molotov "
                  "/ HE) -- return one placement per grenade thrown, each with its own utility read from "
                  "what deploys."),
        "source": ("Tigerr's utility guide: a practice server with the HUD and a ROTATING minimap on, each "
                   "lineup shown as walk-to-spot, aim, throw, result, often with a grenade-cam inset (PIP) "
                   "and repeat throws -- match the game clock to tie a result to its throw. A title card "
                   "naming the lineup marks each one; it is an overlay, never an event."),
        "chapters": [
            (64, 275, "Outside Smokes", "smoke", T),
            (296, 363, "A Site - Squeeky/Vent Rush Smoke", "smoke", T),
            (363, 433, "A Site - Hut Molotov", "molotov", T),
            (433, 513, "A Site - Heaven Utility", "smoke", T),
            (513, 639, "Ramp Utility", "smoke", T),
            (639, 704, "CT Side - Outside Utility", "smoke", CT),
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
                      "CS2 / Nuke lineup localization — %s source" % spec["creator"])
    doc = doc.replace("(Ancient) lineup-localization", "(Nuke) lineup-localization")
    assert "Ancient" not in doc and "xEhS" not in doc, "template leak"
    path = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_NUKE_%s.md" % video)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(doc)
    return path


def build(video, spec, instr):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end + spec["pad"], "ability": ability,
              "name": title, "map": "nuke", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": "nuke", "video": video, "game": "cs2", "instr": instr,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the utility and/or its target; confirm the utility from what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((NUKE, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        instr = write_doc(video, spec)
        out = os.path.join(HERE, "nuke_cs2_args_%s.json" % video)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(build(video, spec, instr), fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s + %s" % (video, len(spec["chapters"]), os.path.basename(out),
                                              os.path.basename(instr)))


main()
