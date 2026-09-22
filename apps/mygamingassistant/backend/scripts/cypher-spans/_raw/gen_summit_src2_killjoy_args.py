"""Build workflow args for Killjoy x Summit, SECOND source (Reco, Sa1JTXfaBFY).

Briiest's `Qoq6I433E-c` is the first Summit source; this one gets its own pack stem `summit-src2`
because ingest_agent joins on youtube_video_id. Uploaded 2026-08-14 on client 13.02, after Summit
entered the pool in 13.00, so no chapter needs a `held` override.

Chapters excluded by name: `intro!`. The two `<site> ultimates!` chapters stay in, but ONLY for
their nanoswarm: Lockdown is the ultimate and is out of scope (the Lockdown is held at 900s).

Same creator as the first Split source (gen_split_killjoy_args.py) and the same CUSTOM KEYBINDS --
the ability bar reads MB4 / Q / MB5 / X, verified on a full-res HUD crop at 300s and full frames at
100s, 650s and 900s. Differences seen on this video: no stats overlay above the location readout,
a ROTATING minimap, yellow burned-in speech subtitles, and a melee skin that throws pink triangle
sparks around the view.
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_SUMMIT-SRC2.md")
VIDEO = "Sa1JTXfaBFY"

SETUP = ("This chapter is a DEFENDER setup by its own title: a setup for one area -- several "
         "devices of DIFFERENT abilities placed back to back. Report side as defender unless your "
         "own window plainly contradicts it.")
ULT = ("This chapter pairs Killjoy's LOCKDOWN (the padlock dome, X - an ultimate, NOT in scope) "
       "with other utility. Enumerate and localize ONLY nanoswarm, turret or alarmbot placements; "
       "never the Lockdown. The title states no side: call it from what the placement serves and "
       "give your confidence.")
LINEUP = ("This chapter is nanoswarm lineups thrown into a site. The title states no side: call "
          "it from what the throw serves (an entry clear or a post-plant is attacker; a retake "
          "denial is defender) and give your confidence.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (1, 27, 215, "a boxes setup!", "turret", SETUP),
    (2, 215, 360, "a link setup!", "turret", SETUP),
    (3, 360, 470, "b main setup!", "turret", SETUP),
    (4, 470, 515, "b box setup!", "turret", SETUP),
    (5, 515, 576, "b deep setup!", "turret", SETUP),
    (6, 576, 710, "a lineups!", "nanoswarm", LINEUP),
    (7, 710, 864, "b lineups!", "nanoswarm", LINEUP),
    (8, 864, 943, "a ultimates!", "nanoswarm", ULT),
    (9, 943, 1009, "b ultimates!", "nanoswarm", ULT),
]

VAR_NOTE = (
    "Summit has two sites (A, B) and a long mid - use Summit callouts (A Main, A Lobby, A Site, "
    "A Garden, A Cave, A Art, A Heaven, A Link, Mid Fountain, Mid Tiles, Mid Bend, Mid Top, "
    "Mid Bottom, B Main, B Lobby, B Site, B Drop, B Hut, B Heaven, B Link, B Gym, Attacker Side "
    "Spawn, Defender Side Spawn). Chapter titles on this source are lower-case and name only an "
    "AREA and a KIND ('a boxes setup!', 'b lineups!'); NONE names an ability. THIS CREATOR USES "
    "CUSTOM KEYBINDS: the ability bar bottom-centre reads MB4 = nanoswarm, Q = alarmbot, MB5 = "
    "turret, X = Lockdown (verified on a full-res HUD crop at 300s and full frames at 100s, 650s "
    "and 900s). Read the slot ICONS, not the key letters: the nanoswarm is the triangular swirl, "
    "the alarmbot the small bot with '!?', the turret the sentry on a stand, the Lockdown the "
    "padlock dome. THE AGENT IS KILLJOY IN EVERY CHAPTER, so report ONLY turret, alarmbot or "
    "nanoswarm. The TURRET and ALARMBOT project a PINK/MAGENTA placement preview over a cyan range "
    "ring onto the surface under the crosshair; that preview is the AIM, never the LANDING. The "
    "creator's MELEE SKIN (a kunai-style blade) scatters PINK/MAGENTA TRIANGLE sparks and a small "
    "pink orb around the view whenever it is out - cosmetic, never a preview, device or cloud. A "
    "pink/purple cloud or dome is an ACTIVATED nanoswarm, never its landing. YELLOW burned-in "
    "SUBTITLES of the creator's speech ('come out here in this corner') appear on some shots - "
    "narration fragments, useful context, never an event. The creator carries the Spike ('HOLD 4 "
    "TO PLANT SPIKE' appears on site); that does NOT make a chapter attacker-side. Summit's "
    "signage carries Chinese characters; describe the landmark, do not transcribe the glyphs. "
    "VALORANT's location readout sits alone at the top-left corner above the minimap ('A Site', "
    "'A Main' observed). The minimap ROTATES with the view, so its orientation is not north-up. "
    "All footage is first-person.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "summit", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in CHAPTERS]

    args = {
        "map": "summit", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # `a boxes setup!` runs 188s; this creator's Split setup chapters (232-330s) needed 24.
        "maxPerChapter": 24,
        "captions": False,
        "groupNote": ("EVERY chapter on this source is grouped: the setup chapters each demonstrate "
                      "many separate placements of DIFFERENT abilities back to back, and the "
                      "lineup and ultimate chapters several throws."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<area> "
                      "setup!', '<site> lineups!' or '<site> ultimates!'. Call every ability "
                      "from what is actually deployed."),
        "titleShort": "the chapter titles on this source name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "summit_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
