"""Build workflow args for Sova x Sunset, one args file per post-9.08 source.

Patch 9.08 (Oct 2024) reworked Sunset's B Main, B site and Mid Courtyard, so older Sova packs show
a different B side. Each source below postdates 9.08 and gets its own pack stem, because
ingest_agent joins on youtube_video_id.

  python gen_sunset_sova_args.py <stem>     (one of the SOURCES keys)
"""
import json
import os
import sys

from sova_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
SCRIPTS = os.path.join(WT, r"apps\mygamingassistant\backend\scripts")

ATTACK = ("This chapter is ATTACKER-side by the source's own labelling (the video's attacker "
          "section / the on-screen plate). Report side as attacker unless your window plainly "
          "shows a defensive use.")
DEFENSE = ("This chapter is DEFENDER-side by the source's own labelling (the video's defender "
           "section / the on-screen plate). Report side as defender unless your window plainly "
           "shows an attacking use.")
ONE_PER_CHAPTER = ("Each chapter on this source is ONE lineup; a survey should normally return "
                   "exactly one placement per chapter.")

# Same Sunset callout text as gen_sunset_viper_args.VAR_NOTE, minus its Viper sentence.
CALLOUTS = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "VALORANT's location readout sits top-left, above the minimap ('A Lobby' observed). Sunset "
    "has green diamond-lattice backlit glass crates and doors; they are map geometry. All footage "
    "is first-person.")
POST_908 = ("Market is its own zone (neither Mid nor B Main) and A Link is part of A SITE on "
            "Sunset. This footage postdates patch 9.08 (Oct 2024), which reworked B Main, B site "
            "and Mid Courtyard. Sunset has no destructible walls or doors.")
SOVA_NOTE = ("THE AGENT IS SOVA, so report ONLY recon (recon bolt) or shock (shock dart); Owl "
             "Drone and Hunter's Fury (his ultimate, three beams) are out of scope. Report CHARGE "
             "(0-2 bars) and BOUNCES (0-2) for every arrow.")

SOURCES = {
    "sunset-yolzy": {
        "video": "rfEYg_5YvoQ",
        "maxPerChapter": 2,
        "groupNote": (ONE_PER_CHAPTER + " A `*Shock Darts` chapter fires TWO darts back to back "
                      "from one stand as ONE lineup: report one placement, not two."),
        "titleNote": ("CHAPTER TITLES NAME THE TARGET (sometimes 'From <STAND>'), and mark shock "
                      "darts with a '*Shock Dart(s)' suffix; every other chapter is a recon bolt. "
                      "Confirm the ability from what lands."),
        "titleShort": "the chapter titles name the target and mark shock darts",
        "varNoteAdd": ("Each chapter OPENS on a HUD-OFF close-up of the DESTINATION under a "
                       "bottom-left plate with a Sova ability icon ('FAST A ELBOW INFO' / "
                       "'ATTACK', 'EARLY A MAIN INFO' / 'DEFENSE'; the plate may say INFO where "
                       "the title says Reveal) -- a PREVIEW, never the stand or the landing. "
                       "Attacker chapters often begin at the buy-phase spawn barrier with the "
                       "knife out. The creator aims a PHANTOM down sights (a red hexagonal bracket "
                       "around the reference) to show the aim reference; that is a demonstration, "
                       "the AIM is the bow drawn on that reference with the CHARGE / BOUNCES "
                       "selector showing. The arrow's flight is followed by a HUD-less camera "
                       "riding it down to the destination -- still the real landing. 2160p "
                       "60fps source."),
        # (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
        # Dropped: 0 intro (0-7) and 14 `Defender Sova Lineups` (281-286, the section header --
        # chapters before it are attacker, after it defender).
        "chapters": [
            (1, 7, 26, "Fast A Elbow Reveal", "recon", ATTACK),
            (2, 26, 47, "Broken A Elbow Reveal", "recon", ATTACK),
            (3, 47, 66, "Fast A Main Reveal", "recon", ATTACK),
            (4, 66, 86, "Insane A Site Reveal From Elbow", "recon", ATTACK),
            (5, 86, 106, "A Site Reveal 2.0", "recon", ATTACK),
            (6, 106, 126, "Simple Mid Reveal", "recon", ATTACK),
            (7, 126, 150, "Best Mid Reveal", "recon", ATTACK),
            (8, 150, 164, "B Market *Shock Dart* To Destroy Cypher Trips", "shock", ATTACK),
            (9, 164, 191, "BROKEN B Site Reveal", "recon", ATTACK),
            (10, 191, 215, "Early B Main Info", "recon", ATTACK),
            (11, 215, 230, "Insane *Shock Dart* to Destroy Cypher Trips On B Site", "shock",
             ATTACK),
            (12, 230, 252, "Simple B Site Reveal", "recon", ATTACK),
            (13, 252, 281, "B Market Reveal", "recon", ATTACK),
            (15, 286, 308, "Early A Main Info", "recon", DEFENSE),
            (16, 308, 329, "A Main Reveal + Sova ULT", "recon", DEFENSE),
            (17, 329, 349, "Simple A Main Reveal", "recon", DEFENSE),
            (18, 349, 367, "A Site Retake Reveal", "recon", DEFENSE),
            (19, 367, 381, "A Site Default *Shock Darts", "shock", DEFENSE),
            (20, 381, 400, "A Site Support Reveal From Mid", "recon", DEFENSE),
            (21, 400, 417, "A Main *Shock Dart* To Destroy Cypher Trips", "shock", DEFENSE),
            (22, 417, 443, "A Main Reveal From Mid", "recon", DEFENSE),
            (23, 443, 466, "Insane Mid Reveal From Market", "recon", DEFENSE),
            (24, 466, 487, "Early B Main Info", "recon", DEFENSE),
            (25, 487, 510, "B Site Retake Reveal", "recon", DEFENSE),
            (26, 510, 531, "B Main Reveal From A Site", "recon", DEFENSE),
            (27, 531, 561, "B Main Cypher Trip *Shock Dart", "shock", DEFENSE),
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
        "instr": os.path.join(SCRIPTS, "LOCALIZE_INSTRUCTIONS_SOVA_%s.md" % stem.upper()),
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        "maxPerChapter": src["maxPerChapter"],
        "captions": False,
        "groupNote": src["groupNote"],
        "titleNote": src["titleNote"],
        "titleShort": src["titleShort"],
        "abilities": ABILITIES,
        "varNote": " ".join((CALLOUTS, POST_908, SOVA_NOTE, src["varNoteAdd"])),
        "items": items,
    }
    out = os.path.join(HERE, "sunset_sova_args_%s.json" % src["video"])
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"), ensure_ascii=False)
    span = sum(e - s for _, s, e, *_ in src["chapters"])
    print("%s: %d chapters, %ds of footage, cap %d -> %s"
          % (src["video"], len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
