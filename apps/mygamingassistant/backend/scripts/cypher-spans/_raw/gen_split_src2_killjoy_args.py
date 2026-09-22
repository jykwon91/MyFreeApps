"""Build workflow args for Killjoy x Split, SECOND source (Amirant, Q-SIy8T-XHc).

Reco's `u2CM5Cra06o` is the first Split source; this one gets its own pack stem `split-src2`
because ingest_agent joins on youtube_video_id. Uploaded 2025-10-17 on client 11.08, after the last
Split change.

Chapters excluded by name:
  - `Turret Trick` -- filmed in a live match with a burned-in "TURRET TRICK ON GAME" banner; it is
    a movement trick with the turret, not a lineup.
`Ult And Ult Combo` stays in for its nanoswarm only (Lockdown is out of scope). `Flank Guide` stays
in: an 18s chapter of placed flank-watch devices.

Default binds (C / Q / E / X), verified on full-res HUD crops at 20s, 90s, 130s and 260s.
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_SPLIT-SRC2.md")
VIDEO = "Q-SIy8T-XHc"

SETUP = ("This chapter is a DEFENDER setup by its own title: site setups -- several devices of "
         "DIFFERENT abilities placed back to back. Report side as defender unless your own window "
         "plainly contradicts it.")
ULT = ("This chapter pairs Killjoy's LOCKDOWN (the padlock dome, X - an ultimate, NOT in scope) "
       "with nanoswarm combos. Enumerate and localize ONLY the nanoswarm(s); never the Lockdown. "
       "The title states no side: call it from what the throw serves and give your confidence.")
LINEUP = ("This chapter is nanoswarm lineups thrown into a site. The title states no side: call "
          "it from what the throw serves (an entry clear or a post-plant is attacker; a retake "
          "denial is defender) and give your confidence.")
FLANK = ("This chapter places devices to WATCH A FLANK. The title states no side: a flank watch "
         "is usually an attacker covering their rear during an execute, but call it from the "
         "footage and give your confidence.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (0, 0, 60, "B Setups", "turret", SETUP),
    (1, 60, 106, "Mid Setups", "turret", SETUP),
    (2, 106, 166, "A Setups", "turret", SETUP),
    (3, 166, 241, "Ult And Ult Combo", "nanoswarm", ULT),
    (4, 241, 329, "B Lineups", "nanoswarm", LINEUP),
    (5, 329, 447, "A Lineups", "nanoswarm", LINEUP),
    (6, 447, 465, "Flank Guide", "alarmbot", FLANK),
]

VAR_NOTE = (
    "Split has two sites (A, B) and a mid with its own Mail zone - use Split callouts (A Main, "
    "A Lobby, A Ramps, A Sewer, A Site, A Screens, A Tower, A Rafters, A Heaven, A Back, Mid Top, "
    "Mid Bottom, Mid Vent, Mid Mail, B Main, B Lobby, B Garage, B Link, B Stairs, B Tower, "
    "B Rafters, B Heaven, B Site, B Alley, B Back, Attacker Side Spawn, Defender Side Spawn). NO "
    "chapter title on this source names an ability. The HUD binds C = nanoswarm, Q = alarmbot, "
    "E = turret, X = Lockdown (verified on full-res HUD crops at 20s, 90s, 130s and 260s). THE "
    "AGENT IS KILLJOY IN EVERY CHAPTER, so report ONLY turret, alarmbot or nanoswarm. The TURRET "
    "and ALARMBOT project a PINK/MAGENTA placement preview over a cyan range ring onto the surface "
    "under the crosshair; that preview is the AIM, never the LANDING. A deployed nanoswarm in range "
    "shows an 'F DETONATE' prompt; a purple sphere with a cyan ring is an ACTIVATED nanoswarm, "
    "never its landing. GHOST MODE: this custom game has the Ghost cheat, which the creator toggles "
    "(chat lines '(Broadcast) Amirant set Ghost to On' / 'Off', bottom-left) to FLY above the map "
    "and show a device from overhead. A floating view over rooftops is a demonstration camera, "
    "never a STAND: STAND is the grounded first-person spot the device is placed or thrown from. "
    "If the placement itself is made while flying, say so in WEAKEST. HUD text that is never an "
    "event: an 'ALLY KILLJOY' nameplate, 'F ATTACH' and 'F DETONATE' prompts, and an AMIRANT "
    "watermark bottom-right. The 1:40 round timer, the 'Client FPS' / 'Network RTT' stats "
    "top-left and VALORANT's location readout directly beneath them ('B Site', 'B Tower', "
    "'B Rafters', 'A Sewer' observed) are on throughout.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "split", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in CHAPTERS]

    args = {
        "map": "split", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # Chapters run 18-118s, each several placements back to back.
        "maxPerChapter": 12,
        "captions": False,
        "groupNote": ("EVERY chapter on this source is grouped: the setup chapters each demonstrate "
                      "several separate placements of DIFFERENT abilities back to back, and the "
                      "lineup and ult chapters several nanoswarm throws."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<Area> Setups', "
                      "'<Site> Lineups', 'Ult And Ult Combo' or 'Flank Guide'. Call every ability "
                      "from what is actually deployed."),
        "titleShort": "the chapter titles on this source name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "split_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
