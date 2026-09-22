"""KILLJOY x SPLIT title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

A per-map module for the same reason as make_instructions_examples_killjoy_lotus.py: each Killjoy
source bucket runs ~90 lines, and the agent's main examples file must stay under the 500-LOC
no-growth line. Every example is a REAL chapter title from that exact source;
make_instructions_data.py merges this with a duplicate-key check.

  python make_instructions.py KILLJOY ascent split --pack split
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_KILLJOY.md
      --video u2CM5Cra06o --creator "Reco" --apply
"""

_REPLACE_60FPS = [
    (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
    ("(`--step 0` = every frame = ~33ms here)", "(`--step 0` = every frame = ~17ms here)"),
    ("`--step 0` \u2014 ~33ms on this source)", "`--step 0` \u2014 ~17ms on this source)"),
]

_TRUE_LINEUPS = (
    "- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
    "- **The `lineups` and ult-combo nanoswarms are TRUE LINEUPS**, not free-hand setups: the throw "
    "is made from a fixed body position with the crosshair parked on a specific spot, so **AIM "
    "carries real information -- pin it on the final settled live aim** and describe the alignment "
    "reference actually visible under the crosshair. If there is none, say so plainly rather than "
    "naming one. The `setups` chapters are the opposite case: placed devices at arm's length, "
    "where AIM is simply the surface under the crosshair.")

_SPLIT_LOOK = (
    "Ascent has **green/teal backlit glass panels",
    "Split has **cyan-lit trims and screens** on its modern interiors, native architecture that can "
    "read as a turret hologram in a montage tile. The PINK/MAGENTA placement preview over a cyan "
    "range ring is the AIM, never the LANDING; a pink/purple cloud or dome is an ACTIVATED "
    "nanoswarm -- a separate act after the landing, never the landing itself.")

EXAMPLES = {
    # Reco's `u2CM5Cra06o` (2025-11-12). Frame study 2026-09-14: chapters from yt-dlp; ability bar
    # off full-res HUD crops at 60/300/520/1120/1200s; readout, previews, clouds, knife-out
    # placements and the sponsor segment off a 12-tile sheet.
    ("KILLJOY", "split"): {
        "grammar": "**`<area> <kind>!`** -- all lower-case with a trailing `!`: an AREA (`a`, `b`, "
                   "`mid/heaven`) and a KIND (`setups`, `ult + molly combo`, `lineups`). **Not one "
                   "chapter names an ability**",
        "examples":
        "`a setups!`, `mid/heaven setups!`, `b setups!`, `a ult + molly combo!`, `b ult + molly "
        "combo!`, `a lineups!`, `b lineups!`. (`intro!`, `outro!` and the `polash peripherals!` "
        "sponsor segment are excluded upstream.) The title gives you the AREA and the KIND of "
        "placement. **The ability comes from the device you see, never from the title.** `setups` "
        "chapters mix turret, alarmbot and nanoswarm; `ult + molly combo` chapters pair the "
        "Lockdown ultimate (out of scope) with nanoswarms; `lineups` chapters are nanoswarm throws.",
        "replace": _REPLACE_60FPS,
        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "u2CM5Cra06o.mp4` -- **2560x1440 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source. Read "
             "the ability bar and the location readout off a full-res still, not a montage tile."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Reco** -- \"*NEW* Radiant Killjoy Guide On SPLIT! (SETUPS + LINEUPS)\", "
             "uploaded 2025-11-12, filmed alone in a custom game (a live round timer, no enemies) "
             "with a `Used Physical Memory` stat in the top-left corner. No editor titles, arrows "
             "or ability icons appear over the gameplay chapters -- the chapter title is the only "
             "label, and it never names the ability."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). **THIS "
             "CREATOR PLAYS ON CUSTOM KEYBINDS**: the ability bar bottom-centre reads **MB4 = "
             "nanoswarm, Q = alarmbot, MB5 = turret, X = Lockdown**. Read the slot ICONS, not the "
             "letters -- the triangular swirl is the nanoswarm, the bot with `!?` the alarmbot, "
             "the sentry on a stand the turret, the padlock dome the Lockdown. Many placements are "
             "made with the knife (a sword-style melee skin) out, and a deployed nanoswarm in range "
             "puts an **`F DETONATE` prompt** on the HUD."),

            _SPLIT_LOOK,

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE.** `setups` chapters are **defender** site setups. The "
             "`lineups` and `ult + molly combo` chapters state no side: call each throw from what "
             "it serves -- an entry clear or a post-plant is attacker, a retake denial is defender "
             "-- and state your confidence."),

            _TRUE_LINEUPS,

            ("- **SIDE**: see the Source section",
             "- **SIDE**: `setups` defender; `lineups` and `ult + molly combo` from what the throw "
             "serves, per the Source section."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout**, not off the title -- on this "
             "source it sits top-left **directly beneath the `Used Physical Memory` stat** (`A "
             "Site`, `B Site`, `B Alley` observed). The creator sometimes opens the full-screen map; "
             "that is game UI, never an event."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**EVERY in-scope chapter on this source is grouped.** The `setups` chapters run 232 to "
             "330 seconds, each a whole area's devices back to back with the ability switching "
             "between them; the `lineups` and ult chapters hold several throws. A survey pass "
             "already split your chapter and handed you a sub-window containing exactly ONE "
             "placement. **Localize only the placement inside your window**; neighbouring "
             "placements belong to other agents. If your window does not contain a complete "
             "placement, say so in WEAKEST with low confidence."),
        ],
    },

    # Amirant's `Q-SIy8T-XHc` (2025-10-17), the SECOND Split source. Frame study 2026-09-14:
    # chapters from yt-dlp; ability bar off full-res HUD crops at 20/90/130/260s; Ghost-mode flight,
    # nameplates, prompts, activated clouds and the Turret Trick banner off a 12-tile sheet.
    ("KILLJOY", "split-src2"): {
        "grammar": "**`<Area> <Kind>`** -- an AREA (`A`, `B`, `Mid`) and a KIND (`Setups`, "
                   "`Lineups`), plus two one-off chapters `Ult And Ult Combo` and `Flank Guide`. "
                   "**Not one chapter names an ability**",
        "examples":
        "`B Setups`, `Mid Setups`, `A Setups`, `Ult And Ult Combo`, `B Lineups`, `A Lineups`, "
        "`Flank Guide`. (`Turret Trick` is excluded upstream: a live-match movement trick, not a "
        "lineup.) The title gives you the AREA and the KIND of placement. **The ability comes from "
        "the device you see, never from the title.** `Setups` chapters mix turret, alarmbot and "
        "nanoswarm; `Ult And Ult Combo` pairs the Lockdown ultimate (out of scope) with nanoswarms; "
        "`Lineups` chapters are nanoswarm throws; `Flank Guide` places flank-watch devices.",
        "replace": _REPLACE_60FPS,
        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "Q-SIy8T-XHc.mp4` -- **1920x1080 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Amirant** -- \"*NEW* Radiant Killjoy Guide On Split! (SETUPS + LINEUPS "
             "+ UltCombo)\", uploaded 2025-10-17, filmed alone in a custom game with a `1:40` round "
             "timer and `Client FPS` / `Network RTT` stats top-left. An **AMIRANT watermark** sits "
             "bottom-right throughout; it is never an event. No editor titles, arrows or ability "
             "icons appear over the in-scope chapters."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). The "
             "ability bar bottom-centre reads **C = nanoswarm, Q = alarmbot, E = turret** (X is the "
             "ult). HUD text that is never an event: an **`ALLY KILLJOY` nameplate** over deployed "
             "devices, and **`F DETONATE` / `F ATTACH` prompts**."),

            _SPLIT_LOOK,

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE.** `Setups` chapters are **defender** site setups. "
             "`Lineups` and `Ult And Ult Combo` state no side: call each throw from what it serves "
             "and state confidence. `Flank Guide` devices watch a flank -- usually an attacker "
             "covering their rear during an execute, but call it from the footage."),

            _TRUE_LINEUPS,

            ("- **SIDE**: see the Source section",
             "- **SIDE**: `Setups` defender; `Lineups`, `Ult And Ult Combo` and `Flank Guide` from "
             "what the placement serves, per the Source section."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout**, not off the title -- on this "
             "source it sits top-left **directly beneath the network stats** (`B Site`, `B Tower`, "
             "`B Rafters`, `A Sewer` observed). **GHOST MODE:** the creator toggles the custom-game "
             "Ghost cheat (chat lines `(Broadcast) Amirant set Ghost to On` / `Off`, bottom-left) "
             "and FLIES above the map to show a device from overhead. A floating view over rooftops "
             "is a demonstration camera, **never a STAND** -- STAND is the grounded first-person "
             "spot the device is placed or thrown from. If the placement itself is made while "
             "flying, say so in WEAKEST."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**EVERY in-scope chapter on this source is grouped.** Chapters run 18 to 118 seconds "
             "and each demonstrates several placements back to back. A survey pass already split "
             "your chapter and handed you a sub-window containing exactly ONE placement. "
             "**Localize only the placement inside your window**; neighbouring placements belong "
             "to other agents. If your window does not contain a complete placement, say so in "
             "WEAKEST with low confidence."),
        ],
    },
}
