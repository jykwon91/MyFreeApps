"""Build workflow args for Cypher x Lotus from ItsFlameBTW's post-12.05 guide.

Patch 12.05 (2026-03-17) reworked A Site / A Main when Lotus re-entered the pool. The only
Cypher Lotus source filmed after it is ItsFlameBTW's "New Cypher Setups for Lotus (2026)"
(oXi8SvpXrSw, uploaded 2026-03-23; its description says "Lotus is back in patch 12.05").

Chapters are SECTIONS that hold many placements each, so the survey pass splits them. Excluded
by name, the same rule the Abyss and Summit runs used:
  - "Example A/B/C Site Setup" re-show placements the per-ability chapters already cover.
  - "Intro" / "Join my Discord Server!" are obvious.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_CYPHER_LOTUS-FLAME.md")
VIDEO = "oXi8SvpXrSw"

# (index, start, end, title) straight from scripts/dump_chapters.py.
CHAPTERS = [
    (1, 15, 132, "A Site Cameras"),
    (2, 132, 365, "A Site Tripwires and One Way Cages"),
    (4, 411, 465, "B Site Cameras"),
    (5, 465, 568, "B Site Tripwires"),
    (7, 616, 685, "C Site Cameras"),
    (8, 685, 1128, "C Site Tripwires and One Way Cages"),
]

VAR_NOTE = (
    "Lotus has THREE sites (A, B, C) and a mid joined by rotating doors - use Lotus callouts. "
    "This footage postdates patch 12.05, which reworked A Site and A Main: read the geometry "
    "you see, not a remembered layout. Call the ability from what is deployed on screen, never "
    "from the chapter title alone. This creator burns NO captions, title plates or drawn marks "
    "onto the frame, so the only evidence is the footage itself: the equipped device, the "
    "deploy, and VALORANT's own location readout above the minimap. The round timer is frozen "
    "at 1:40 throughout. After placing a camera the creator may cut to the CAMERA'S OWN remote "
    "view to show its coverage - that view is never gameplay from the placing position, so no "
    "STAND, AIM or LANDING may be pinned inside it.")

MIXED = ("MIXED-ability chapter: it demonstrates trapwires AND one-way cyber cages. Call EACH "
         "placement's ability from what is deployed on screen; the nominal ability on this item "
         "is only a placeholder.")


def ability_of(title):
    t = title.lower()
    if "trip" in t or "trap" in t or "wire" in t:
        return "trapwire"
    if "cage" in t or "one way" in t or "one-way" in t:
        return "cyber-cage"
    if "camera" in t or "cam" in t:
        return "spycam"
    raise SystemExit(f"ABORT - no ability for chapter title {title!r}; extend ability_of() "
                     f"rather than defaulting, or the whole chapter ships under a guess.")


def cap_of(end, start):
    """Placement cap per chapter, from its LENGTH (~20s per placement on this source).

    No upper clamp: the C chapter runs 443s, and a clamp would silently truncate it -- the
    grouped-chapter failure this workflow exists to prevent.
    """
    return max(4, round((end - start) / 20))


def main():
    items = []
    for idx, s, e, title in CHAPTERS:
        it = {"nn": "%02d" % idx, "cs": s, "next": e, "ability": ability_of(title),
              "name": title, "map": "lotus"}
        if "and" in title.lower().split():
            it["varNoteAdd"] = MIXED
        items.append(it)

    args = {
        "map": "lotus", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": max(cap_of(e, s) for _, s, e, _ in CHAPTERS),
        "captions": False,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "lotus_cypher_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, _ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   per-chapter cap estimate:",
          {"%02d" % idx: cap_of(e, s) for idx, s, e, _ in CHAPTERS})


main()
