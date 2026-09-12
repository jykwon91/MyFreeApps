"""Build workflow args for Cypher x Abyss.

Abyss had zero Cypher coverage: the earlier Cypher source (UsfCu5uL3Qs) predates the map
entering the pool and never covers it. ItsFlameBTW's guide was uploaded 2026-08-18, AFTER
patch 11.08 reworked B Site and the Mid hallway into B Main, so nothing here needs the
`held` override the June-2024 Abyss sources did.

Chapters that are NOT placements are excluded by name, not by guesswork -- the same rule
the Summit run used:
  - "Example A Setups" / "Example B Setups" walk through a finished setup, re-showing
    placements already demonstrated. Localizing them would duplicate rows that the
    per-ability chapters already cover, at different timestamps, with no way to dedup.
  - "Extra Tips and Tricks" is talk-through, not a deploy.
  - "Intro" / "Thank you!" are obvious.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_CYPHER_ABYSS.md")
VIDEO = "mLtLqWULAqQ"

# (index, start, end, title) straight from scripts/dump_chapters.py.
CHAPTERS = [
    (1, 17, 59, "A Site Cameras"),
    (2, 59, 213, "A Site Tripwires"),
    (3, 213, 270, "A Site One Way Cage"),
    (5, 356, 389, "Cameras for Mid"),
    (6, 389, 424, "Tripwires for Mid"),
    (7, 424, 484, "One Way Cages for Mid"),
    (8, 484, 539, "B Site Cameras"),
    (9, 539, 744, "B Site Tripwires"),
    (10, 744, 791, "B Site One Way Cage"),
    (13, 1008, 1065, "Attack Tripwires"),
]

VAR_NOTE = (
    "Abyss is a NEWER map with a vertical, bridge-and-void layout - do not pattern-match "
    "callouts from older maps, and note that A Lobby / B Lobby are SEPARATE zones from "
    "A Main / B Main here. Call the ability from what is deployed on screen, never from the "
    "chapter title alone. This creator burns NO captions, title plates or drawn marks onto "
    "the frame, so the only evidence is the footage itself: the equipped device, the deploy, "
    "and VALORANT's own location readout above the minimap. After placing a camera the "
    "creator often cuts to the CAMERA'S OWN remote view to show its coverage - that view is "
    "never gameplay from the placing position, so no STAND, AIM or LANDING may be pinned "
    "inside it.")

ATTACK_NOTE = (
    "This chapter is the source's only ATTACKER-side section, by its own title: these are "
    "flank wires placed on the way in, not site-anchor setups. Report side as attacker.")


def ability_of(title):
    t = title.lower()
    if "cage" in t or "one way" in t or "one-way" in t:
        return "cyber-cage"
    if "trip" in t or "trap" in t or "wire" in t:
        return "trapwire"
    if "camera" in t or "cam" in t:
        return "spycam"
    raise SystemExit(f"ABORT - no ability for chapter title {title!r}; extend ability_of() "
                     f"rather than defaulting, or the whole chapter ships under a guess.")


def cap_of(end, start):
    """Placement cap per chapter, from its LENGTH.

    A placement on this source runs ~20-25s (walk in, aim, place, show the result). The
    default 6 would silently truncate the two long tripwire chapters -- 154s and 205s --
    which is the grouped-chapter failure this workflow exists to prevent.
    """
    return max(4, min(10, round((end - start) / 20)))


def main():
    items = []
    for idx, s, e, title in CHAPTERS:
        it = {"nn": "%02d" % idx, "cs": s, "next": e, "ability": ability_of(title),
              "name": title, "map": "abyss"}
        if title == "Attack Tripwires":
            it["varNoteAdd"] = ATTACK_NOTE
        items.append(it)

    args = {
        "map": "abyss", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": max(cap_of(e, s) for _, s, e, _ in CHAPTERS),
        # This creator burns nothing onto the frame; without this the survey prompt tells
        # every agent the captions are the best evidence available and invites an invention.
        "captions": False,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "abyss_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, _ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   abilities:", {t: sum(1 for i in items if i["ability"] == t)
                            for t in sorted({i["ability"] for i in items})})
    print("   per-chapter cap estimate:",
          {"%02d" % idx: cap_of(e, s) for idx, s, e, _ in CHAPTERS})


main()
