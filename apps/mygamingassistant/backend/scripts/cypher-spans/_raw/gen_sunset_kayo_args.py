"""Build workflow args for KAY/O x Sunset, one args file per post-9.08 source.

Patch 9.08 (Oct 2024) reworked B Main, B site and Mid Courtyard, so every Sunset KAY/O row filmed
before it is stale. Each source below postdates 9.08 and gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_sunset_kayo_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from kayo_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by the source's own labelling (the video's `Attack` "
          "section). Report side as attacker unless your window plainly shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by the source's own labelling (the video's second half, "
           "after the `Defense,` header, where the minimap orientation flips). Report side as "
           "defender unless your window plainly shows an attacking use.")
ONE_PER_CHAPTER = ("Each chapter on this source is ONE lineup; a survey should normally return "
                   "exactly one placement per chapter.")

CALLOUTS = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "Market is its own zone, and A Link is part of A SITE on Sunset, not mid. VALORANT's location "
    "readout sits top-left, above the minimap. Sunset has green diamond-lattice backlit glass "
    "crates and doors; they are map geometry. Sunset has no destructible walls or doors. All "
    "footage is first-person.")
POST_908 = ("This footage postdates patch 9.08 (Oct 2024), which reworked B Main, B site's back "
            "boxes and Mid Courtyard; read the geometry you see, not a remembered layout.")
KAYO_NOTE = ("THE AGENT IS KAY/O, so report ONLY zero-point (the suppression blade), flashdrive "
             "(the flash grenade) or fragment (the hex frag); NULL/cmd (his ultimate) is out of "
             "scope. KAY/O has no charge: report CHARGE none.")

SOURCES = {
    "sunset-maxwell": {
        "video": "zL9ZP3JjR5Q",
        "maxPerChapter": 2,
        "groupNote": ONE_PER_CHAPTER,
        "titleNote": ("CHAPTER TITLES READ '<STAND> to <TARGET>' and name no ability; the video's "
                      "chapter list groups them under ZERO/point, FLASH/drive and FRAG/ment "
                      "headers, which is the fallback ability. Confirm the ability from what "
                      "deploys. Non-Riot title terms: A Short -> A Main (site-side end), Elbow -> "
                      "A Elbow, Tiles -> Mid Tiles, Top Mid -> Mid Top, Boba -> B Boba, Alley -> "
                      "A Alley, Mid Pillar -> Mid, A Default -> A Site, B Backsite / B Default -> "
                      "B Site, bare A / B -> A Site / B Site."),
        "titleShort": "the chapter titles name stand and target; the ability comes from the group",
        "varNoteAdd": ("A bottom-left two-line plate ('From A-Lobby' / 'To A-Short'; red From line "
                       "on attack, blue on defense) repeats the title - an editor overlay, never "
                       "an event. The creator shows a full-screen punch-in zoom with a small red "
                       "circle drawn around the crosshair on the aim reference; that zoom is a "
                       "demonstration, the AIM is the live view with the ability held on that "
                       "reference. Burned-in captions and the top-right Client FPS graph are "
                       "overlays. Filmed over several sessions (client 13.02-13.05). 24fps source: "
                       "one frame is ~42ms."),
        # (index, start, end, title, group ability, side note) from the description's chapter list.
        # Dropped: 1 `Attack` (0-5, section header). Chapters 2-16 are the attack half and 17-31
        # follow the `Defense,` header.
        "chapters": [
            (2, 5, 19, "A Lobby to A Short", "zero-point", ATTACK),
            (3, 19, 42, "A Lobby to Elbow & A", "zero-point", ATTACK),
            (4, 42, 58, "Tiles to Mid", "zero-point", ATTACK),
            (5, 58, 80, "B Lobby to Market", "zero-point", ATTACK),
            (6, 80, 98, "A Lobby to A Short", "flashdrive", ATTACK),
            (7, 98, 116, "A Lobby to Elbow", "flashdrive", ATTACK),
            (8, 116, 140, "A Main to A", "flashdrive", ATTACK),
            (9, 140, 157, "A to Top Mid", "flashdrive", ATTACK),
            (10, 157, 177, "Mid to Top Mid", "flashdrive", ATTACK),
            (11, 177, 198, "B Main to B", "flashdrive", ATTACK),
            (12, 198, 220, "B Main to B Backsite", "flashdrive", ATTACK),
            (13, 220, 243, "A Main to A Default", "fragment", ATTACK),
            (14, 243, 263, "Elbow to A Default 2", "fragment", ATTACK),
            (15, 263, 280, "B Main to B Backsite", "fragment", ATTACK),
            (16, 280, 295, "B Main to B Default", "fragment", ATTACK),
            (17, 295, 313, "A Link to A Main", "zero-point", DEFENSE),
            (18, 313, 323, "A Link to A", "zero-point", DEFENSE),
            (19, 323, 346, "A to B Main", "zero-point", DEFENSE),
            (20, 346, 365, "A Link to A & Elbow", "zero-point", DEFENSE),
            (21, 365, 389, "Top Mid to A Main", "zero-point", DEFENSE),
            (22, 389, 414, "B Backsite to Elbow", "zero-point", DEFENSE),
            (23, 414, 440, "B Backsite to B Main", "zero-point", DEFENSE),
            (24, 440, 459, "A Short to A Main", "flashdrive", DEFENSE),
            (25, 459, 479, "A to A Main", "flashdrive", DEFENSE),
            (26, 479, 501, "A Link to A", "flashdrive", DEFENSE),
            (27, 501, 523, "B to B Main", "flashdrive", DEFENSE),
            (28, 523, 542, "Boba to B Backsite", "flashdrive", DEFENSE),
            (29, 542, 562, "A Link to A Default", "fragment", DEFENSE),
            (30, 562, 582, "Alley to A Default", "fragment", DEFENSE),
            (31, 582, 603, "Top Mid to Mid Pillar", "fragment", DEFENSE),
            (32, 603, 634, "Boba to B Default", "fragment", DEFENSE),
        ],
    },
}


def main():
    stem = sys.argv[1]
    src = SOURCES[stem]
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "sunset", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in src["chapters"]]

    args = {
        "map": "sunset", "video": src["video"],
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_KAYO_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": ABILITIES,
        "varNote": " ".join((CALLOUTS, POST_908, KAYO_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "sunset_kayo_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
