"""Build workflow args for Cypher x Sunset from ItsFlameBTW's post-9.08 guide.

Patch 9.08 (Oct 2024) reworked B Main, B site and Mid Courtyard (and removed a B Main Cypher
trip spot). ItsFlameBTW's "Best Cypher Setups for Sunset" (AqbapzWItwU, uploaded 2026-07-01)
postdates it.

  python gen_sunset_cypher_args.py [stem]     (a SOURCES key; default sunset-flame)

Chapters are SECTIONS that hold many placements each, so the survey pass splits them. Excluded
after a frame survey, the same rule the Lotus / Abyss / Summit runs used:
  - "Sample A Setup" / "Sample B Setup" re-place a full setup built from placements the
    per-ability chapters already demonstrate (same green-crate trip on A, same cam/trip/cage on B).
  - "Tips for A" plays an already-placed one-way cage from behind a box; no new placement.
  - "Summary" / "Thank you!" are obvious.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

DEFENSE = ("This chapter is DEFENDER-side: it is part of a defensive setups guide. Report side as "
           "defender unless your window plainly shows an attacking use.")
ATTACK = ("This chapter is ATTACKER-side by its own title ('Attack Guide'). Report side as "
          "attacker unless your window plainly shows a defensive use.")
MIXED = ("MIXED-ability chapter: it demonstrates more than one of spycam / trapwire / cyber cage. "
         "Call EACH placement's ability from what is deployed on screen; the nominal ability on "
         "this item is only a placeholder.")

VAR_NOTE = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "Market is its own zone, and A Link is part of A SITE on Sunset, not mid. "
    "THE AGENT IS CYPHER, so report ONLY spycam, trapwire or cyber-cage; his ultimate (Neural "
    "Theft) is out of scope. VALORANT's location readout sits top-left, above the minimap "
    "('A Main' observed). Sunset has green diamond-lattice backlit glass crates and doors; they "
    "are map geometry, not a cage. All footage is first-person. "
    "This footage postdates patch 9.08 (Oct 2024), which reworked B Main, B site and Mid "
    "Courtyard and removed a B Main Cypher trip spot: read the geometry you see, not a remembered "
    "layout. Call the ability from what is deployed on screen, never from the chapter title "
    "alone. The round timer is frozen at 1:40 throughout and a BUY MENU cuts in between some "
    "placements. After placing a camera the creator may cut to the CAMERA'S OWN remote view to "
    "show its coverage - that view is never gameplay from the placing position, so no STAND, AIM "
    "or LANDING may be pinned inside it.")

SOURCES = {
    "sunset-flame": {
        "video": "AqbapzWItwU",
        "varNoteAdd": ("This creator burns a chapter TITLE PLATE (bold white text, top-left) for "
                       "the first seconds of each chapter, occasional centred CAPTIONS ('Very "
                       "niche, use as last resort only', 'One way cages cause hesitation...') and "
                       "at least once a drawn RED CIRCLE around a HUD ability icon - all EDITOR "
                       "overlays, never events. The creator sometimes drops an in-game PING (a "
                       "diamond marker with a callout and distance) - a callout hint, not an "
                       "event."),
        # (index, start, end, title, nominal ability, side note, mixed?) from the chapter list.
        "chapters": [
            (1, 15, 120, "A Site Cameras", "spycam", DEFENSE, False),
            (2, 120, 308, "A Site Tripwires", "trapwire", DEFENSE, False),
            (3, 308, 387, "A Site One Way Cages", "cyber-cage", DEFENSE, False),
            (6, 447, 480, "Mid/Market Setup and One Way", "cyber-cage", DEFENSE, True),
            (7, 480, 562, "B Site Cameras", "spycam", DEFENSE, False),
            (8, 562, 670, "B Site Tripwires", "trapwire", DEFENSE, False),
            (9, 670, 855, "B Site One Way Cages", "cyber-cage", DEFENSE, False),
            (11, 898, 1010, "Attack Guide", "trapwire", ATTACK, True),
        ],
    },
}


def cap_of(end, start):
    """Placement cap per chapter, from its LENGTH.

    The Lotus run used ~20s per placement; this source places faster (the frame survey shows a
    new cam/trip roughly every 8-15s), so size at ~12s per placement. No upper clamp: a clamp
    would silently truncate the 188s A tripwire chapter -- the grouped-chapter failure this
    workflow exists to prevent.
    """
    return max(4, round((end - start) / 12))


def main():
    stem = sys.argv[1] if len(sys.argv) > 1 else "sunset-flame"
    src = SOURCES[stem]
    items = []
    for idx, s, e, title, ability, side, mixed in src["chapters"]:
        note = side + (" " + MIXED if mixed else "")
        items.append({"nn": "%02d" % idx, "cs": s, "next": e, "ability": ability,
                      "name": title, "map": "sunset", "varNoteAdd": note})

    chapters = src["chapters"]
    args = {
        "map": "sunset", "video": src["video"],
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_CYPHER_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": max(cap_of(e, s) for _, s, e, *_ in chapters),
        "captions": False,
        "varNote": VAR_NOTE + " " + src["varNoteAdd"],
        "items": items,
    }
    out = os.path.join(HERE, "sunset_cypher_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in chapters)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   per-chapter cap estimate:",
          {"%02d" % idx: cap_of(e, s) for idx, s, e, *_ in chapters})


main()
