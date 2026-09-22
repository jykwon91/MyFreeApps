"""Build workflow args for Killjoy x Sunset (Reco, shvDHsAXn9g).

Sunset had zero Killjoy coverage. Uploaded 2025-05-01 on client 10.08; Sunset's layout has not
changed since, so no chapter needs a `held` override.

Chapters excluded by name:
  - `intro!`, `outro!`
  - `polash peripherals!` -- a sponsor segment, no gameplay

Same creator and CUSTOM KEYBINDS as the Split and second Summit sources -- the ability bar reads
MB4 / Q / MB5 / X, verified on a full-res HUD crop at 100s and full frames at 520s and 700s. This
video is 3840x2160 and carries a `Client FPS` stat above the location readout, a ROTATING minimap
and yellow burned-in speech subtitles.
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_SUNSET.md")
VIDEO = "shvDHsAXn9g"

SETUP = ("This chapter is a DEFENDER setup by its own title: site setups -- several devices of "
         "DIFFERENT abilities placed back to back. Report side as defender unless your own window "
         "plainly contradicts it.")
LINEUP = ("This chapter is nanoswarm lineups thrown into a site. The title states no side: call "
          "it from what the throw serves (an entry clear or a post-plant is attacker; a retake "
          "denial is defender) and give your confidence.")
ATTACK = ("This chapter is ATTACKER-side by its own title ('attacking <site>'): utility used while "
          "taking or holding a site on attack -- flank-watch devices or post-plant throws. Report "
          "side as attacker and call the ability from the device you see.")

# (index, start, end, title, fallback ability, side note) from yt-dlp's chapter metadata.
CHAPTERS = [
    (1, 17, 236, "a setups!", "turret", SETUP),
    (3, 310, 360, "mid/market setups!", "turret", SETUP),
    (4, 360, 497, "b site setups!", "turret", SETUP),
    (5, 497, 552, "a lineups!", "nanoswarm", LINEUP),
    (6, 552, 595, "a lineups variations!", "nanoswarm", LINEUP),
    (7, 595, 625, "b lineups!", "nanoswarm", LINEUP),
    (8, 625, 690, "b lineups variations!", "nanoswarm", LINEUP),
    (9, 690, 711, "attacking a site!", "turret", ATTACK),
    (10, 711, 728, "attacking b site!", "turret", ATTACK),
]

VAR_NOTE = (
    "Sunset has two sites (A, B), a mid courtyard and Market - use Sunset callouts (A Main, "
    "A Lobby, A Site, A Elbow, A Link, A Alley, Mid Top, Mid Bottom, Mid Courtyard, Mid Tiles, "
    "Market, B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn). "
    "Chapter titles on this source are lower-case and name only an AREA and a KIND ('a setups!', "
    "'b lineups variations!', 'attacking a site!'); NONE names an ability. THIS CREATOR USES "
    "CUSTOM KEYBINDS: the ability bar bottom-centre reads MB4 = nanoswarm, Q = alarmbot, MB5 = "
    "turret, X = Lockdown (verified on a full-res HUD crop at 100s and full frames at 520s and "
    "700s). Read the slot ICONS, not the key letters: the nanoswarm is the triangular swirl, the "
    "alarmbot the small bot with '!?', the turret the sentry on a stand, the Lockdown the padlock "
    "dome. THE AGENT IS KILLJOY IN EVERY CHAPTER, so report ONLY turret, alarmbot or nanoswarm. A "
    "held nanoswarm (a canister with a copper domed top and orange eyes) puts a two-mouse-button "
    "throw prompt above the MB4 slot; a deployed turret or alarmbot puts a recall prompt above its "
    "own slot. The TURRET and ALARMBOT project a PINK/MAGENTA placement preview over a cyan range "
    "ring onto the surface under the crosshair; that preview is the AIM, never the LANDING. A "
    "pink/purple cloud or dome is an ACTIVATED nanoswarm, never its landing. YELLOW burned-in "
    "SUBTITLES of the creator's speech ('strong turret because', 'on this hook and do') appear on "
    "many shots - narration fragments, useful context, never an event. A small world-space label "
    "with a callout and a distance ('A Main 4m') is a map PING, never an event. Sunset has green "
    "diamond-lattice backlit glass crates and doors; they are map geometry, not a hologram. "
    "VALORANT's location readout sits top-left directly beneath a 'Client FPS' stat ('A Main', "
    "'A Lobby' observed). The minimap ROTATES with the view, so its orientation is not north-up. "
    "All footage is first-person.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": ability, "name": title,
        "map": "sunset", "varNoteAdd": note,
    } for idx, s, e, title, ability, note in CHAPTERS]

    args = {
        "map": "sunset", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # `a setups!` runs 219s; this creator's Split setup chapters (232-330s) needed 24.
        "maxPerChapter": 24,
        "captions": False,
        "groupNote": ("EVERY chapter on this source is grouped: the setup chapters each demonstrate "
                      "many separate placements of DIFFERENT abilities back to back, and the "
                      "lineup and attacking chapters several placements or throws."),
        "titleNote": ("CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they read '<area> "
                      "setups!', '<site> lineups!', '<site> lineups variations!' or 'attacking "
                      "<site>!'. Call every ability from what is actually deployed."),
        "titleShort": "the chapter titles on this source name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "sunset_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, *_ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))


main()
