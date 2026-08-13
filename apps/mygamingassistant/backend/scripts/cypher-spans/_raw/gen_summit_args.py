"""Build workflow args for Cypher x Summit from two sources.

Summit is the in-pool map this agent had zero coverage on (the earlier source,
UsfCu5uL3Qs, predates Summit entering the pool and never covers it).

Two sources per the multi-source ingest rule -- one video per agent x map is a
defect, because each creator shows a different subset of spots. They are kept in
SEPARATE packs: ingest_agent joins on youtube_video_id, so two videos in one
pack would recut every clip from the wrong mp4.

Chapters that are NOT placements are excluded by name, not by guesswork:
  - "Attacker's POV" / "Attack Guide" show the ENEMY view of a spot already
    demonstrated. Localizing them would invent a lineup whose STAND is an
    attacker standing somewhere the setup is not placed from.
  - "Position Guide" / "Where to Play?" / "Sample X Setup" are positioning
    talk-through, not a deploy.
  - "Intro" / "Thank you!" are obvious.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
INSTR = os.path.join(
    r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-cypher",
    r"apps\mygamingassistant\backend\scripts\LOCALIZE_INSTRUCTIONS_CYPHER.md")

# (index, start, end, title) straight from scripts/dump_chapters.py.
SOURCES = {
    "y8XT-7jCBLA": [
        (1, 17, 67, "A Site Cameras"),
        (2, 67, 199, "A Site Tripwires"),
        (3, 199, 268, "A Site One Way Cages"),
        (5, 330, 409, "A Link/Mid One Ways"),
        (7, 445, 499, "Mid Setups"),
        (8, 499, 583, "B Site Cameras"),
        (9, 583, 705, "B Site Tripwires"),
        (10, 705, 825, "B Site One Way Cages"),
    ],
    "6PbBfx6EuzM": [
        (0, 0, 24, "B Site Trap-wires & Camera Setting 1"),
        (3, 56, 84, "B Site Trap-wires & Camera Setting 2"),
        (5, 106, 137, "B Link One-way Cage"),
        (7, 147, 176, "A Site Trap-wires & Camera Setting"),
        (9, 204, 235, "A Site One-way Cage"),
        (11, 247, 281, "A Link One-way Cage"),
        (13, 296, 315, "Mid Trap-wires & Camera Setting"),
    ],
}

MIXED = ("MIXED-ability chapter: it demonstrates cameras and trapwires together. "
         "Call EACH placement's ability from what is deployed on screen; the "
         "nominal ability on this item is only a placeholder.")

VAR_NOTE = (
    "Summit is a NEW map - do not pattern-match callouts from older maps. "
    "Call the ability from the footage, never from the chapter title. "
    "This source intercuts ATTACKER-POV demonstration shots showing the spot "
    "from the enemy side; those are NOT the placement and must never be used "
    "for a STAND beat. A placement is filmed from the PLAYER's own view with "
    "the ability equipped in hand.")


def ability_of(title):
    t = title.lower()
    if "cage" in t or "one way" in t or "one-way" in t:
        return "cyber-cage"
    if "trip" in t or "trap" in t:
        return "trapwire"
    if "camera" in t or "cam" in t:
        return "spycam"
    return "spycam"


def mixed(title):
    t = title.lower()
    return ("trap" in t or "trip" in t) and ("cam" in t or "camera" in t)


def main():
    for vid, chapters in SOURCES.items():
        items = []
        for idx, s, e, title in chapters:
            it = {"nn": "%02d" % idx, "cs": s, "next": e,
                  "ability": ability_of(title), "name": title, "map": "summit"}
            if mixed(title):
                it["varNoteAdd"] = MIXED
            items.append(it)

        args = {
            "map": "summit", "video": vid, "instr": INSTR,
            "surveyModel": "opus", "surveyEffort": "high",
            "locModel": "opus", "locEffort": "high",
            "gateModel": "opus", "gateEffort": "high",
            "maxPerChapter": 8,
            "varNote": VAR_NOTE,
            "items": items,
        }
        out = os.path.join(HERE, "summit_args_%s.json" % vid)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(args, fh, separators=(",", ":"))
        span = sum(e - s for _, s, e, _ in chapters)
        print("%s: %d chapters, %ds of placement footage -> %s"
              % (vid, len(items), span, os.path.basename(out)))
        print("   abilities:", {t: sum(1 for i in items if i["ability"] == t)
                                for t in sorted({i["ability"] for i in items})})


main()
