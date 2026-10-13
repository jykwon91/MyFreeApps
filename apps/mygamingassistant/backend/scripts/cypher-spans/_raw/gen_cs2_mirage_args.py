"""Build workflow args (and localizer docs) for two CS2 Mirage sources that fill the library's thin
smoke (10) and molotov (7) coverage.

  - NartOutHere `MJ-dtTYTUS8` (2025-05-20, 518s, 1080p60): "CS2 Mirage Smokes You NEED to Know in
    2026". One smoke per chapter except the 'From 1 Position / Spot', '&' and 'Execute' chapters.
    Mirage has had collision fixes only since, no geometry change.
  - Tigerr `mt0m8f39-f4` (2026-07-22, 1132s, 1440p60): "MUST KNOW Mirage Utility for Free Elo". Five
    long area chapters, each several lineups of MIXED utility (smoke / flash / molotov / HE).

Chapter bounds come from yt-dlp (`dump_chapters.py`); Intro/Outro are left out, and NartOutHere's 2s
'CS2 Mirage Connector Smoke' stub (104-106) is folded into the 'Top Mid Smoke & Connector Smoke'
chapter that follows it. The localizer doc is derived from the NartOutHere Ancient doc: only the source,
callout and side sections are rewritten.

  python gen_cs2_mirage_args.py
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

MIRAGE = (
    "Mirage. Use Mirage callouts for stand and target (T Spawn, T Ramp, A Ramp, Palace, Tetris, "
    "Sandwich, Firebox, Triple, Stairs, Jungle, Connector, Ticket Booth, CT, A Site, Top Mid, Mid, "
    "Window, Short/Catwalk, Underpass, Apartments, B Short, Market, Kitchen, Van, Bench, B Site, "
    "CT Spawn). A is reached from A Ramp and Palace (Jungle / Connector from Mid); B from Apartments "
    "and Short/Catwalk (Market / Kitchen from CT).")

CALLOUT_BLOCK = """## Zone / side — record CALLOUTS, not fixture slugs
Use current Mirage callouts (T Spawn, T Ramp, A Ramp, Palace, Tetris, Sandwich, Firebox, Triple, Stairs,
Jungle, Connector, Ticket Booth, CT, A Site, Top Mid, Mid, Window, Short/Catwalk, Underpass, Apartments,
B Short, Market, Kitchen, Van, Bench, B Site, CT Spawn).
- **A Site** is entered by T from **A Ramp** and **Palace**, and from Mid through **Connector** and
  **Jungle**/**Stairs**. CT holds it from **CT** / **Ticket Booth** and **Jungle**.
- **B Site** is entered by T from **Apartments** and from Mid via **Short/Catwalk**; CT reaches it
  through **Market** (Market Door / Window) and **Kitchen**.
- **Mid** runs from **Top Mid** (T side) to **Window** (CT side), with **Connector** and **Short**
  branching off and **Underpass** below.
Read the HUD minimap's location label when shown — it is the most reliable callout. Lead each of `target`
and `stand_loc` with ONE callout; put extra description after a ` - `.
- `target` = where the utility deploys; `stand_loc` = where it is thrown from.
- SIDE = **T** or **CT**. %s Confirm from the frames and say which cue you used in NOTES.
"""

SOURCES = {
    "MJ-dtTYTUS8": {
        "per": 3, "pad": PAD, "dur": 518, "res": "1920x1080 @ 60fps",
        "creator": "NartOutHere", "title": "CS2 Mirage Smokes You NEED to Know in 2026",
        "uploaded": "2025-05-20",
        "side_rule": ("Most chapters are T-side smokes. 'Defensive' / 'to Defend' chapters and smokes "
                      "thrown from Ticket or Market are CT. 'CT' in a chapter title names the TARGET "
                      "(the CT cross), not the side."),
        "group": ("Each chapter is normally ONE smoke. '&', 'From 1 Position / Spot', 'Execute' and "
                  "'Defensive Smoke' chapters may throw several, and the Magnojezzz chapter adds a "
                  "MOLOTOV -- return one placement per grenade, each with its own utility."),
        "source": ("NartOutHere's smoke guide: every chapter is a SMOKE (one Magnojezzz molotov), HUD on "
                   "(scoreboard, minimap location label, round clock). A top-right section label spans "
                   "several chapters and is an overlay, never an event. Results are often drawn with a "
                   "yellow grenade TRAIL and sometimes seen from a spectator / third-person angle; the "
                   "trail is never evidence of the release. Neighbouring chapters often share a stand "
                   "-- pin THIS chapter's throw."),
        "chapters": [
            (47, 76, "CS2 Mirage Window Smoke", "smoke", T),
            (76, 104, "Mirage Top Mid Smoke in CS2", "smoke", T),
            (104, 123, "Top Mid Smoke & Connector Smoke", "smoke", T),
            (123, 130, "Mirage Bottom Connector Smoke", "smoke", T),
            (130, 155, "CS2 Mirage Connector Smoke From Top Mid", "smoke", T),
            (155, 169, "Mirage Top connector smoke from underpass", "smoke", T),
            (169, 178, "CS2 Mirage T Side A Execute Smokes", "smoke", T),
            (178, 188, "Mirage A Stairs Smoke", "smoke", T),
            (188, 198, "Mirage A Jungle Smoke", "smoke", T),
            (198, 210, "CS2 Mirage Right Side A Smokes From 1 Position", "smoke", T),
            (210, 220, "Mirage Stairs and Jungle Smokes From 1 Spot", "smoke", T),
            (220, 240, "Huge Mirage A Smokes", "smoke", T),
            (240, 251, "Mirage A Smokes From T Spawn", "smoke", T),
            (251, 263, "CS2 Mirage Deep Jungle & Top Connector Smokes", "smoke", T),
            (263, 280, "CS2 Mirage CT Smoke", "smoke", T),
            (280, 306, "Mirage Jungle Smoke From Ramp", "smoke", T),
            (306, 318, "Magnojezzz Mirage Jungle Smoke & Stairs Molotov", "smoke", T),
            (318, 325, "Deep Jungle Smoke From Ramp", "smoke", T),
            (325, 333, "Mirage Top Connector Smoke From apEX", "smoke", T),
            (333, 339, "CS2 Mirage Jungle Smoke from Tetris", "smoke", T),
            (339, 349, "Mirage Ramp Smoke to Entry A", "smoke", T),
            (349, 360, "CS2 Mirage Kitchen Smoke", "smoke", T),
            (360, 368, "Mirage Market Window Smoke", "smoke", T),
            (368, 382, "CS2 Mirage Market Window Smoke", "smoke", T),
            (382, 394, "Mirage Short Smoke From Aps", "smoke", T),
            (394, 415, "Defensive Mirage Underpass Smoke", "smoke", CT),
            (415, 442, "Mirage Bottom Connector Smoke to Defend Mid", "smoke", CT),
            (442, 450, "Mirage Ramp Smoke", "smoke", INFER),
            (450, 455, "CS2 Mirage Ramp Smoke", "smoke", INFER),
            (455, 459, "Mirage Palace Smoke from outside market", "smoke", INFER),
            (459, 466, "Mirage Palace smoke from Ticket", "smoke", INFER),
            (466, 479, "Mirage A Defensive Smoke", "smoke", CT),
            (479, 485, "Mirage B Aps Smoke", "smoke", INFER),
            (485, 518, "Mirage B Defensive Smoke", "smoke", CT),
        ],
    },
    "mt0m8f39-f4": {
        "per": 16, "pad": 0, "dur": 1132, "res": "2560x1440 @ 60fps",
        "creator": "Tigerr", "title": "MUST KNOW Mirage Utility for Free Elo | Mirage Utility Guide",
        "uploaded": "2026-07-22",
        "side_rule": ("'Spawn/Mid Smokes' is T side and 'CT Side Utility' is CT side. The Top Mid, A Site "
                      "and B Site chapters can hold BOTH T executes and CT retake / anti-rush utility, so "
                      "read each lineup's side from the footage (AK = T, M4 = CT, which spawn it starts "
                      "from)."),
        "group": ("Each chapter is a whole AREA: SEVERAL lineups back to back, of MIXED utility (smoke / "
                  "flash / molotov / HE) -- return one placement per grenade thrown, each with its own "
                  "utility read from what deploys."),
        "source": ("Tigerr's utility guide: a practice server with the HUD and a ROTATING minimap on, each "
                   "lineup shown as walk-to-spot, aim, throw, result, often with a grenade-cam inset "
                   "(PIP) and repeat throws -- match the game clock to tie a result to its throw. A title "
                   "card naming the lineup ('JUNGLE SMOKE') marks each one; it is an overlay, never an "
                   "event. The id contains '-': pass it as `--video=mt0m8f39-f4`."),
        "chapters": [
            (32, 192, "Spawn/Mid Smokes", "smoke", T),
            (192, 442, "Top Mid Utility", "smoke", INFER),
            (442, 798, "A Site Utility", "smoke", INFER),
            (798, 973, "B Site Utility", "smoke", INFER),
            (973, 1095, "CT Side Utility", "smoke", CT),
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
        "- Creator: **%s**, \"%s\", uploaded %s. Mirage has had only collision fixes since; read the\n"
        "  geometry you see.\n"
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
                      "CS2 / Mirage lineup localization — %s source" % spec["creator"])
    doc = doc.replace("(Ancient) lineup-localization", "(Mirage) lineup-localization")
    assert "Ancient" not in doc and "xEhS" not in doc, "template leak"
    path = os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CS2_MIRAGE_%s.md" % video)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(doc)
    return path


def build(video, spec, instr):
    items = [{"nn": "%02d" % (i + 1), "cs": start, "next": end + spec["pad"], "ability": ability,
              "name": title, "map": "mirage", "varNoteAdd": note}
             for i, (start, end, title, ability, note) in enumerate(spec["chapters"])]
    return {
        "map": "mirage", "video": video, "game": "cs2", "instr": instr,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": spec["per"],
        "captions": False,
        "groupNote": spec["group"],
        "titleNote": "Chapter titles name the utility and/or its target; confirm the utility from what deploys.",
        "titleShort": "the chapter titles name the utility",
        "abilities": CS2,
        "varNote": " ".join((MIRAGE, spec["source"])),
        "items": items,
    }


def main():
    for video, spec in SOURCES.items():
        instr = write_doc(video, spec)
        out = os.path.join(HERE, "mirage_cs2_args_%s.json" % video)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(build(video, spec, instr), fh, separators=(",", ":"), ensure_ascii=False)
        print("%s: %d chapters -> %s + %s" % (video, len(spec["chapters"]), os.path.basename(out),
                                              os.path.basename(instr)))


main()
