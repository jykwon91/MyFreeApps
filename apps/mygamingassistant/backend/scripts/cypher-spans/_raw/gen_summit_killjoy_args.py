"""Build workflow args for Killjoy x Summit (Briiest, Qoq6I433E-c).

Summit had zero Killjoy coverage. The map entered the pool in patch 13.00 (2026-06-23) and this
guide was uploaded 2026-07-02 on client 13.00, so no chapter needs a `held` override.

Same creator and layout as the Lotus run (gen_lotus_killjoy_args.py): burned-in serif captions,
`Turrets <Site>` chapters that name the ability, `Setups` chapters that mix abilities. Two
differences seen on the frame study:

  1. A `Mid Lurk Postplant Lineups` chapter -- attacker post-plant throws from a mid lurk.
  2. Postplant shots are sometimes DIMMED by the editor (the whole frame darkened, seen at 420s
     and 450s) to spotlight a spot. That is an overlay, never an event.

Excluded by name: `Intro`, and `Killjoy Ultimate Spots` (no ultimate is seeded as a utility_type).
"""
import json
import os

from killjoy_abilities import ABILITIES

HERE = os.path.dirname(os.path.abspath(__file__))
WT = r"C:\Users\jason\Documents\Git\MyFreeApps-worktrees\mga-abyss-cypher"
INSTR = os.path.join(WT, r"apps\mygamingassistant\backend\scripts",
                     "LOCALIZE_INSTRUCTIONS_KILLJOY_SUMMIT.md")
VIDEO = "Qoq6I433E-c"

# (index, start, end, title) from yt-dlp's chapter metadata.
CHAPTERS = [
    (1, 16, 94, "Turrets A-Site"),
    (2, 94, 167, "Turrets B-Site"),
    (3, 167, 242, "Setups A-Site"),
    (4, 242, 374, "Setups B-Site"),
    (5, 374, 481, "Postplant Lineups A-Site"),
    (6, 481, 574, "Postplant Lineups B-Site"),
    (7, 574, 676, "Mid Lurk Postplant Lineups"),
    (8, 676, 711, "Initiator Lineups A-Site"),
]

VAR_NOTE = (
    "Summit has two sites (A, B) and a long mid - use Summit callouts (A Main, A Lobby, A Site, "
    "A Garden, A Cave, A Art, A Heaven, A Link, Mid Fountain, Mid Tiles, Mid Bend, Mid Top, "
    "Mid Bottom, B Main, B Lobby, B Site, B Drop, B Hut, B Heaven, B Link, B Gym, Attacker Side "
    "Spawn, Defender Side Spawn). Call the ability from what is deployed on screen: only the two "
    "'Turrets' chapters name an ability in their title. This creator burns a CAPTION onto most "
    "placements in a large serif font across the lower third ('This Turret gives you early info "
    "on Main and gives info if someone is lurking Mid') - quote them - but one caption can cover "
    "SEVERAL placements, so it is a chapter-level plan, not a label for one placement. The HUD "
    "binds C = nanoswarm, Q = alarmbot, E = turret, X = Lockdown (padlock dome) - verified on a "
    "full-res crop at 50s and full frames at 300s, 620s and 690s. THE AGENT IS KILLJOY IN EVERY "
    "CHAPTER, so report ONLY turret, alarmbot or nanoswarm. A held nanoswarm (a small canister "
    "with a copper domed top and orange eyes) puts a two-mouse-button throw prompt above the C "
    "slot. A deployed turret or alarmbot shows a recall prompt above its own slot. The turret "
    "placement preview is a PINK hologram over a cyan ring - the AIM, never the LANDING. An "
    "ACTIVATED nanoswarm is a pink/purple dome; that is the activation, not the landing. On the "
    "postplant chapters the editor sometimes DIMS the whole frame to spotlight a spot - an "
    "overlay, never an event. Thin cyan lines drawn flat on the ground at each site are "
    "VALORANT's own spike plant-zone boundary (the creator carries the Spike) - map geometry, and "
    "carrying the Spike does NOT make a chapter attacker-side. Summit's signage and posters carry "
    "Chinese characters; describe the landmark, do not transcribe the glyphs. VALORANT's location "
    "readout sits top-left above the minimap and is on ('A Site', 'A Lobby', 'Mid Bend' "
    "observed). The minimap is fixed-orientation. All footage is first-person.")

DEFENDER_NOTE = (
    "This chapter is DEFENDER-side by its own title ('Turrets' / 'Setups'): devices placed on a "
    "site to hold it. Report side as defender unless your own window plainly contradicts it.")
ATTACKER_POSTPLANT = (
    "This chapter is ATTACKER-side: a postplant only exists once your own team has planted, and "
    "these are lineups thrown to cover the planted spike. Report side as attacker.")
ATTACKER_LURK = (
    "This chapter is ATTACKER-side: post-plant lineups thrown by a LURKER in mid onto a planted "
    "spike, so STAND is somewhere in mid and TARGET is on a site. Report side as attacker.")
ATTACKER_INITIATOR = (
    "This chapter is ATTACKER-side: these are lineups thrown from outside a space to clear it "
    "before entering. Report side as attacker.")


def side_note(title):
    if title.startswith(("Turrets ", "Setups ")):
        return DEFENDER_NOTE
    if title.startswith("Postplant "):
        return ATTACKER_POSTPLANT
    if title.startswith("Mid Lurk Postplant "):
        return ATTACKER_LURK
    if title.startswith("Initiator "):
        return ATTACKER_INITIATOR
    raise SystemExit(f"ABORT - no side note for chapter {title!r}; this source is mixed-side.")


def fallback_ability(title):
    """Ability used ONLY if the survey returns none for a placement (see the Abyss generator)."""
    if title.startswith("Turrets "):
        return "turret"
    if "Lineups" in title:
        return "nanoswarm"
    if title.startswith("Setups "):
        return "turret"
    raise SystemExit(f"ABORT - no fallback ability for chapter title {title!r}.")


def main():
    items = [{
        "nn": "%02d" % idx, "cs": s, "next": e, "ability": fallback_ability(title),
        "name": title, "map": "summit", "varNoteAdd": side_note(title),
    } for idx, s, e, title in CHAPTERS]

    args = {
        "map": "summit", "video": VIDEO, "instr": INSTR,
        "surveyModel": "opus", "surveyEffort": "high",
        "locModel": "opus", "locEffort": "high",
        "gateModel": "opus", "gateEffort": "high",
        # Setups B-Site runs 132s, longer than any Lotus chapter from this creator (cap 20 there).
        "maxPerChapter": 20,
        "captions": True,
        "captionExamples": ('"This Turret gives you early info on Main and gives info if someone '
                            'is lurking Mid"'),
        "groupNote": ("This source groups several separate placements into ONE chapter. The "
                      "'Turrets' chapters are runs of turret placements; the 'Setups' chapters mix "
                      "ABILITIES (a setup places a turret, an alarmbot and nanoswarms in "
                      "sequence); the 'Lineups' chapters are runs of nanoswarm throws."),
        "titleNote": ("MOST CHAPTER TITLES ON THIS SOURCE NAME NO ABILITY -- they are '<Kind> "
                      "<Area>', e.g. 'Setups A-Site', 'Mid Lurk Postplant Lineups'. Only the "
                      "'Turrets <Site>' chapters name one. Call every ability from what is "
                      "actually deployed; use the burned-in caption as context, not as a "
                      "per-placement label."),
        "titleShort": "the chapter titles on this source mostly name no ability",
        "abilities": ABILITIES,
        "varNote": VAR_NOTE,
        "items": items,
    }
    out = os.path.join(HERE, "summit_killjoy_args_%s.json" % VIDEO)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(args, fh, separators=(",", ":"))
    span = sum(e - s for _, s, e, _ in CHAPTERS)
    print("%s: %d chapters, %ds of placement footage, cap %d -> %s"
          % (VIDEO, len(items), span, args["maxPerChapter"], os.path.basename(out)))
    print("   fallbacks:", {i["nn"]: i["ability"] for i in items})
    print("   sides:", {i["nn"]: ("defender" if "DEFENDER" in i["varNoteAdd"] else "attacker")
                        for i in items})


main()
