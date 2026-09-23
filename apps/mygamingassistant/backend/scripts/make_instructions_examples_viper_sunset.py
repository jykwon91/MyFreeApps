"""VIPER x SUNSET title-grammar buckets -- one entry per SOURCE CUT, keyed (AGENT, pack stem).

Sunset's only Viper source (Snapiex, V5212_RxPYQ, 2023-09) predates patch 9.08 (Oct 2024), which
reworked B Site, B Main and Mid Courtyard, and its pack was never ingested. These buckets describe
the post-rework sources instead. All derive from the Snapiex-built Sunset doc and override every
claim it makes about Snapiex's footage:

  python make_instructions.py VIPER sunset sunset --pack <stem>
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_VIPER_SUNSET.md
      --video <id> --creator "<creator>" --apply

A per-map module for the same reason as the killjoy_<map> files: the agent's main examples file
must stay under the 500-LOC no-growth line.
"""

# Claims in the Snapiex doc that are false of every post-rework source, overridden identically.
_COMMON_BULLETS = [
    ("## Two rows have a PLACEHOLDER stand",
     "**STAND comes from your item.** It was read from the chapter title or the source's framing, "
     "then confirmed where possible against VALORANT's own location readout (top-left, above the "
     "minimap). That readout is transient -- it appears on crossing into an area and fades -- so "
     "report the area you actually see the deploy made from in STAND_LOC and flag a genuine "
     "contradiction in NOTES."),
    ("**A slash joins two adjacent areas",
     "- **Report where the utility actually lands**, not a paraphrase of the title. A `from X` "
     "clause names where the player STANDS, never what the utility hits."),
    ("**Do NOT report a SIDE",
     "- **SIDE comes from your item's note**, which states what the source's own framing shows "
     "(for example the player carrying the spike, or a post-plant lineup onto a planted spike). "
     "Report it unless your window plainly contradicts it, and say so in NOTES if it does. The "
     "practice server spawns the demo player on either side regardless, so spawn-side cues alone "
     "are not evidence."),
    # The base doc said the toxic screen is placed from a top-down map. CoachCow's footage shows
    # VALORANT's normal first-person aim-and-fire, confirmed by the localizer and the gate.
    ("- **toxic-screen**",
     "- **toxic-screen** -> **THIS ONE IS NOT THROWN.** Viper raises her gauntlet, parks a small "
     "green reticle on a surface while the minimap previews the wall LINE, and fires; a row of "
     "emitters then rises into a tall **WALL of green gas**. Map the events like this and say in "
     "NOTES that you did: **AIM** = the reticle held on its reference, immediately pre-fire; "
     "**THROW** = the **FIRE** -- the frame the reticle and the minimap preview vanish and the arm "
     "thrusts forward (no projectile to follow); **LANDING** = the emitters rising / the gas wall "
     "becoming visible along the line."),
    # The base doc carries its own copy of the Market / A Link warning, and make_instructions also
    # appends the shared MAPS note after the callout list, so this bullet slot states the rework.
    ("**Two of these callouts do NOT mean",
     "- **This footage is POST patch 9.08** (Oct 2024), which reworked B Main, B Main exterior, "
     "B site's back boxes and Mid Courtyard. Older Sunset footage you may remember shows a "
     "different B side; read the geometry you see, not a remembered layout."),
]
_SIDE_REPLACE = ("SIDE: not reported (deferred upstream — this source never states one)",
                 "SIDE: <attacker|defender>   (from your item's note; flag a contradiction)")
_EXAMPLES_MARKER = "**TARGET comes from the lineup's name; STAND comes from your item.**"

EXAMPLES = {
    # Frost LIVE's `XfRvdsxx1P8` (2025-12-22, 1440p60, client 11.02 on the HUD). An all-maps
    # compilation; only its four Sunset chapters (357-435) are in scope.
    ("VIPER", "sunset-frost"): {
        "examples_marker": _EXAMPLES_MARKER,
        "grammar": "**`Viper Lineup Sunset <TARGET> from <STAND>`** -- the title names both ends. "
                   "**TARGET and STAND both come from the title**; confirm them against the footage",
        "examples":
        "`Viper Lineup Sunset A Default from Lobby` lands on A site's default plant and is thrown "
        "from A Lobby; `Viper Lineup Sunset B Default from Lobby` from B Lobby; `Viper Lineup "
        "Sunset B Default from Mid Courtyard` from Mid Courtyard; `Viper Lineup Sunset A Back "
        "Crates from Top Mid` lands on the crates at the back of A site and is thrown from Mid Top.",
        "replace": [_SIDE_REPLACE],
        "bullets": [
            ("brackets the utility",
             "- Each chapter is ONE lineup, and **no title names the utility** -- call it from "
             "what deploys. Frame study of all four chapters shows snake-bite ACID POOLS, thrown "
             "by a player carrying the spike (SPIKE panel at the right edge), i.e. post-plant "
             "mollies. A custom game with a round timer, a `Client FPS` readout top-left, a "
             "`Client Version` string bottom-right. The creator draws a RED ARROW onto the "
             "alignment point during the aim -- an EDITOR overlay, never an event, though it "
             "marks the reference the crosshair is set on."),
            ("## Three chapters are COMBOS",
             "**One utility per chapter.** Every chapter throws exactly ONE lineup."),
            ("These chapters are long (26-53s)",
             "**Chapters here run 16-23s** -- a short walk to the spot, the aim with its red "
             "arrow, the throw and the pool."),
        ] + _COMMON_BULLETS,
    },
}

# The three GROUPED sources share their Source-section overrides but for the creator's editing.
_GROUPED_COMBOS = (
    "## Three chapters are COMBOS",
    "**Chapters here are GROUPED.** One chapter demonstrates several separate placements back to "
    "back -- walls, orbs and mollies, often a wall and an orb as one setup. A survey pass already "
    "split the chapter and handed you a sub-window holding exactly ONE placement: localize only "
    "that one, name its ability in ABILITY, and ignore the neighbours.")


def _grouped_source(editing, lengths):
    return [
        ("brackets the utility",
         "- **No chapter title names one lineup's utility** -- call it from what deploys. " + editing),
        _GROUPED_COMBOS,
        ("These chapters are long (26-53s)", lengths),
    ]


EXAMPLES.update({
    # nAts's `LbcPQO_AdJI` (2026-03-25, 1440p60): an all-maps guide whose whole Sunset section is
    # ONE chapter (1042-1179).
    ("VIPER", "sunset-nats"): {
        "examples_marker": _EXAMPLES_MARKER,
        "grammar": "**`<Map>`** -- one chapter per map, so the title names neither target nor "
                   "stand. **TARGET and STAND come from the footage**: the deploy you see and "
                   "VALORANT's own location readout",
        "examples": "`Sunset` is the only chapter in scope; `Intro` and the other maps' chapters "
                    "are not.",
        "replace": [_SIDE_REPLACE],
        "bullets": _grouped_source(
            "Frame study shows walls, orbs and one-way setups across the section. The creator's "
            "WEBCAM sits as a picture-in-picture box at the left under the minimap, and editor "
            "text is burned in at times (a `1280x960` resolution label, `BUY PHASE` banners) -- "
            "overlays, never events. Some shots use the scoped-out map view of an `INFO` kiosk "
            "board; that is map geometry, not a minimap cutaway.",
            "**The chapter runs 137s** and holds many placements; your sub-window is one of them.",
        ) + _COMMON_BULLETS,
    },
    # CoachCow's `X8erN-c1kyE` (2025-05-10, 1080p60): a Sunset-only guide.
    ("VIPER", "sunset-coachcow"): {
        "examples_marker": _EXAMPLES_MARKER,
        "grammar": "**`<Site> <Kind>`** -- what the chapter demonstrates, with at most a site, so "
                   "**TARGET and STAND come from the footage**: the deploy you see and VALORANT's "
                   "own location readout",
        "examples": "`B Attacking Viper Wall`, `B Poison Cloud + Wall Combo`, `A Attacking Viper "
                    "Wall`, `A Poison Cloud + Wall Combo`, `Defender Viper Walls`, `Viper Poison "
                    "Cloud Lineups`, `Viper Molly Lineups`. `Attacking` / `Defender` state the "
                    "side the creator frames the setup for; `Combo` means a wall and an orb.",
        "replace": [_SIDE_REPLACE],
        "bullets": _grouped_source(
            "Frame study shows toxic-screen walls, poison-cloud orbs and snake-bite pools, with no "
            "captions. The creator sometimes draws a RED ARROW onto the HUD or an alignment point "
            "-- an EDITOR overlay, never an event -- and a subscribe prompt pops up mid-video.",
            "**Chapters here run 9-37s**, several placements each.",
        ) + _COMMON_BULLETS,
    },
    # Locked's `KrlfJElQex4` (2025-07-27, 1080p60): an all-maps guide; its last map section
    # (2904-3277) is Sunset, confirmed from the footage (Pawn Shop, the INFO kiosk).
    ("VIPER", "sunset-locked"): {
        "examples_marker": _EXAMPLES_MARKER,
        "grammar": "**`<Site> <kind>`** -- the role of the setup, so **TARGET and STAND come from "
                   "the footage**: the deploy you see and VALORANT's own location readout",
        "examples": "`A attack`, `Mid orb`, `B attack`, `Post Plant Lineups`, `Lurk Setup`, `Solo "
                    "Defense`, `Double Defense`, `Market One-way`. `attack` and `Post Plant` are "
                    "attacker setups, `Defense` defender ones.",
        "replace": [_SIDE_REPLACE],
        "bullets": _grouped_source(
            "Frame study shows walls, orbs, one-ways and snake-bite pools. The creator often "
            "shows a LARGE MAP with the cyan wall line drawn on it as a DEMONSTRATION of where "
            "the wall will run. It is not the aim: the wall is aimed first-person (reticle on a "
            "surface, minimap previewing the line) right before the fire.",
            "**Chapters here run 24-160s**, several placements each.",
        ) + _COMMON_BULLETS,
    },
})
