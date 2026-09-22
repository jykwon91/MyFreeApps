"""Build workflow args for Killjoy x Split, FIRST source (Reco, u2CM5Cra06o).

Split had zero Killjoy coverage. Uploaded 2025-11-12 (client 11.x), after the last Split change, so
no chapter needs a `held` override.

Chapters excluded by name:
  - `intro!`, `outro!`
  - `polash peripherals!` -- a sponsor segment (a web page and captions), no gameplay
The two `ult + molly combo!` chapters stay in, but ONLY for their nanoswarm: Lockdown is the
ultimate and is out of scope.

THIS CREATOR PLAYS ON CUSTOM KEYBINDS -- the ability bar reads MB4 / Q / MB5 / X, verified on
full-res HUD crops at 60s, 300s, 520s, 1120s and 1200s. The slot ORDER is still Riot's (nanoswarm,
alarmbot, turret, Lockdown), so the icons are what the localizer is told to read.
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_SPLIT.md")
VIDEO = "u2CM5Cra06o"

SETUP = ("This chapter is a DEFENDER setup by its own title: site setups -- several devices of "
         "DIFFERENT abilities placed back to back. Report side as defender unless your own window "
         "plainly contradicts it.")
ULT = ("This chapter pairs Killjoy's LOCKDOWN (the padlock dome, X - an ultimate, NOT in scope) "
       "with a nanoswarm ('molly'). Enumerate and localize ONLY the nanoswarm(s); never the "
       "Lockdown. The title states no side: call it from what the throw serves and give your "
       "confidence.")
LINEUP = ("This chapter is nanoswarm lineups thrown into a site. The title states no side: call "
          "it from what the throw serves (an entry clear or a post-plant is attacker; a retake "
          "denial is defender) and give your confidence.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (1, 24, 354, "a setups!", "turret", SETUP),
    (3, 428, 660, "mid/heaven setups!", "turret", SETUP),
    (4, 660, 954, "b setups!", "turret", SETUP),
    (5, 954, 1032, "a ult + molly combo!", "nanoswarm", ULT),
    (6, 1032, 1098, "b ult + molly combo!", "nanoswarm", ULT),
    (7, 1098, 1175, "a lineups!", "nanoswarm", LINEUP),
    (8, 1175, 1310, "b lineups!", "nanoswarm", LINEUP),
]

VAR_NOTE = (
    "Split has two sites (A, B) and a mid with its own Mail zone - use Split callouts (A Main, "
    "A Lobby, A Ramps, A Sewer, A Site, A Screens, A Tower, A Rafters, A Heaven, A Back, Mid Top, "
    "Mid Bottom, Mid Vent, Mid Mail, B Main, B Lobby, B Garage, B Link, B Stairs, B Tower, "
    "B Rafters, B Heaven, B Site, B Alley, B Back, Attacker Side Spawn, Defender Side Spawn). "
    "Chapter titles on this source are lower-case and name only an AREA and a KIND ('a setups!', "
    "'b lineups!'); NONE names an ability. THIS CREATOR USES CUSTOM KEYBINDS: the ability bar "
    "bottom-centre reads MB4 = nanoswarm, Q = alarmbot, MB5 = turret, X = Lockdown (verified on "
    "full-res HUD crops at 60s, 300s, 520s, 1120s and 1200s). Read the slot ICONS, not the key "
    "letters: the nanoswarm is the triangular swirl, the alarmbot the small bot with '!?', the "
    "turret the sentry on a stand, the Lockdown the padlock dome. THE AGENT IS KILLJOY IN EVERY "
    "CHAPTER, so report ONLY turret, alarmbot or nanoswarm. The TURRET and ALARMBOT project a "
    "PINK/MAGENTA placement preview over a cyan range ring onto the surface under the crosshair; "
    "that preview is the AIM, never the LANDING. Many placements are made with the knife out (a "
    "sword-style melee skin). A deployed nanoswarm in range shows an 'F DETONATE' prompt; a "
    "pink/purple cloud is an ACTIVATED nanoswarm, never its landing. This is a custom game with a "
    "live round timer and a 'Used Physical Memory' stat in the top-left corner, with VALORANT's "
    "location readout directly beneath it ('A Site', 'B Site', 'B Alley' observed). The creator "
    "sometimes opens the full-screen map; that is game UI, never an event. All footage is "
    "first-person.")


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
        # The setup chapters run 232-330s, each a whole area's worth of devices back to back.
        "maxPerChapter": 24,
        "captions": False,
        "groupNote": ("EVERY chapter on this source is grouped: the setup chapters each demonstrate "
                      "many separate placements of DIFFERENT abilities back to back, and the "
                      "lineup and ult chapters several nanoswarm throws."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<area> "
                      "setups!', '<site> ult + molly combo!' or '<site> lineups!'. Call every "
                      "ability from what is actually deployed."),
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
