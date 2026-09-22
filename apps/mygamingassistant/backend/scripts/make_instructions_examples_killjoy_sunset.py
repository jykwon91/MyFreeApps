"""KILLJOY x SUNSET title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

A per-map module for the same reason as make_instructions_examples_killjoy_lotus.py: each Killjoy
source bucket runs ~90 lines, and the agent's main examples file must stay under the 500-LOC
no-growth line. Every example is a REAL chapter title from that exact source;
make_instructions_data.py merges this with a duplicate-key check.

  python make_instructions.py KILLJOY ascent sunset --pack sunset
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_KILLJOY.md
      --video shvDHsAXn9g --creator "Reco" --apply
"""

_REPLACE_60FPS = [
    (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
    ("(`--step 0` = every frame = ~33ms here)", "(`--step 0` = every frame = ~17ms here)"),
    ("`--step 0` \u2014 ~33ms on this source)", "`--step 0` \u2014 ~17ms on this source)"),
]

_SUNSET_LOOK = (
    "Ascent has **green/teal backlit glass panels",
    "Sunset has **green diamond-lattice backlit glass** on its crates and doors, native "
    "architecture that can read as a turret hologram in a montage tile. The PINK/MAGENTA "
    "placement preview is the AIM, never the LANDING; a pink/purple cloud or dome is an ACTIVATED "
    "nanoswarm -- a separate act after the landing, never the landing itself. A small world-space "
    "label with a callout and a distance (`A Main 4m`) is a map **PING** -- game UI, never an "
    "event, though its label can corroborate where a device sits.")

_TRUE_LINEUPS = (
    "- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
    "- **Nanoswarm lineups on this source are TRUE LINEUPS**, not free-hand setups: the throw is "
    "made from a fixed body position with the crosshair parked on a specific spot, so **AIM "
    "carries real information -- pin it on the final settled live aim** and describe the "
    "alignment reference actually visible under the crosshair. If there is none, say so plainly "
    "rather than naming one. The setup chapters are the opposite case: placed devices at arm's "
    "length, where AIM is simply the surface under the crosshair.")

EXAMPLES = {
    # Reco's `shvDHsAXn9g` (2025-05-01, client 10.08; Sunset's layout is unchanged since). Frame
    # study 2026-09-15: chapters from yt-dlp; custom-bind ability bar off a full-res HUD crop at
    # 100s and full frames at 520s and 700s; subtitles, pings and the rotating minimap.
    ("KILLJOY", "sunset"): {
        "grammar": "**`<area> <kind>!`** -- all lower-case with a trailing `!`: an AREA (`a`, "
                   "`mid/market`, `b site`) and a KIND (`setups`, `lineups`, `lineups variations`), "
                   "plus `attacking <site> site!`. **Not one chapter names an ability**",
        "examples":
        "`a setups!`, `mid/market setups!`, `b site setups!`, `a lineups!`, `a lineups "
        "variations!`, `b lineups!`, `b lineups variations!`, `attacking a site!`, `attacking b "
        "site!`. (`intro!`, `outro!` and the `polash peripherals!` sponsor segment are excluded "
        "upstream.) The title gives you the AREA and the KIND of placement. **The ability comes "
        "from the device you see, never from the title.** `setups` chapters mix turret, alarmbot "
        "and nanoswarm; `lineups` chapters are nanoswarm throws; `attacking` chapters are "
        "flank-watch devices or post-plant throws.",
        "replace": _REPLACE_60FPS,
        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "shvDHsAXn9g.mp4` -- **3840x2160 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source. Read "
             "the ability bar and the location readout off a full-res still, not a montage tile."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Reco** -- \"*NEW* Radiant Killjoy Guide On SUNSET (SETUPS + LINEUPS)\", "
             "uploaded 2025-05-01, filmed alone in a custom game (no enemies). No editor titles, "
             "arrows or ability icons appear over the gameplay chapters. **YELLOW burned-in "
             "subtitles** of the creator's speech (`strong turret because`) appear on many shots "
             "-- narration fragments, useful context, never an event."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). **THIS "
             "CREATOR PLAYS ON CUSTOM KEYBINDS**: the ability bar bottom-centre reads **MB4 = "
             "nanoswarm, Q = alarmbot, MB5 = turret, X = Lockdown**. Read the slot ICONS, not the "
             "letters -- the triangular swirl is the nanoswarm, the bot with `!?` the alarmbot, "
             "the sentry on a stand the turret, the padlock dome the Lockdown. A held nanoswarm (a "
             "canister with a copper domed top and orange eyes) puts a **two-mouse-button throw "
             "prompt above the MB4 slot**; a deployed turret or alarmbot puts a **recall prompt "
             "above its own slot**."),

            _SUNSET_LOOK,

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE.** `setups` chapters are **defender** site setups. "
             "`attacking <site> site!` chapters are **attacker** by their own title. The `lineups` "
             "chapters state no side: call each throw from what it serves -- an entry clear or a "
             "post-plant is attacker, a retake denial is defender -- and state your confidence."),

            _TRUE_LINEUPS,

            ("- **SIDE**: see the Source section",
             "- **SIDE**: `setups` defender, `attacking` attacker; `lineups` from what the throw "
             "serves, per the Source section."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout**, not off the title -- on this "
             "source it sits top-left **directly beneath a `Client FPS` stat** (`A Main`, `A "
             "Lobby` observed). The minimap **ROTATES with the view**, so its orientation is not "
             "north-up."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**EVERY in-scope chapter on this source is grouped.** The setup chapters run 50 to "
             "219 seconds, each a whole area's devices back to back with the ability switching "
             "between them; the `lineups` and `attacking` chapters hold several placements. A "
             "survey pass already split your chapter and handed you a sub-window containing "
             "exactly ONE placement. **Localize only the placement inside your window**; "
             "neighbouring placements belong to other agents. If your window does not contain a "
             "complete placement, say so in WEAKEST with low confidence."),
        ],
    },

    # Chiru's `MgMzBBl8TVg` (2024-06-20, client 08.11), the SECOND Sunset source. Frame study
    # 2026-09-15: chapters from yt-dlp; ability bar, held canister and world pings off full frames
    # at 15s, 130s and 200s.
    ("KILLJOY", "sunset-src2"): {
        "grammar": "**`<Site> <Kind> [<detail>]`** -- a SITE letter, then `Setup <n>` or a `Post "
                   "plant Lineup` with an optional spot (`Default`, `Behind Box`, `Stairs`) and "
                   "number. **Not one chapter names an ability**",
        "examples":
        "`A Setup 1`, `A Setup 2`, `B Setup 1`, `B Setup 2`, `A Default Post plant Lineup`, `A "
        "Default Post plant Lineup #2`, `A Behind Box Post plant Lineup`, `B Default Post plant "
        "Lineup`, `B Default Post plant Lineup #2`, `B Stairs Post plant Lineup`. The title gives "
        "you the SITE and the KIND of placement. **The ability comes from the device you see, "
        "never from the title.** `Setup` chapters mix turret, alarmbot and nanoswarm; `Post plant` "
        "chapters are nanoswarm throws.",
        "replace": _REPLACE_60FPS,
        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "MgMzBBl8TVg.mp4` -- **1920x1080 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Chiru** -- \"Killjoy Sunset Guide (Lineups & Setups)\", uploaded "
             "2024-06-20, filmed in a custom game with a `1:40` round timer, a scoreboard and a "
             "network-stats bar across the top. **There are NO editor titles, captions, arrows or "
             "ability icons on this source** -- the chapter title is the only label, and it never "
             "names the ability."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities can appear on this source** -- turret "
             "and alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). "
             "**The discriminator: only the NANOSWARM is held in the hand as a model** -- a small "
             "canister with an orange domed top, a white body and orange eyes -- and while it is "
             "equipped a two-mouse-button throw prompt sits above the C slot. The turret and "
             "alarmbot instead project a **pink/magenta placement preview** onto the surface under "
             "the crosshair. The ability bar bottom-centre reads **C = nanoswarm, Q = alarmbot, E "
             "= turret** (X is the ult), and a deployed nanoswarm in range puts an **`F DETONATE` "
             "prompt** on the HUD."),

            _SUNSET_LOOK,

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE, and the chapter KIND tells you which is which.** "
             "`Setup` chapters are **defender** site setups. `Post plant` chapters are "
             "**attacker** -- a post-plant only exists once your own team has planted."),

            _TRUE_LINEUPS,

            ("- **SIDE**: see the Source section",
             "- **SIDE**: `Setup` chapters defender, `Post plant` chapters attacker, per the Source "
             "section -- then justify it from what your placement serves."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout**, not off the title -- on this "
             "source it sits **directly beneath the network-stats bar** (`A Site`, `B Lobby`, "
             "`Attacker Side Spawn` observed). The creator's world PINGS (`A Site 2m`, `Mid Tiles "
             "7m`) can corroborate a spot. The minimap **ROTATES with the view**, so its "
             "orientation is not north-up."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**The `Setup` chapters here are grouped**: each (29-34s) places a whole site setup -- "
             "several devices back to back. A survey pass already split your chapter and handed "
             "you a sub-window containing exactly ONE placement. **Localize only the placement "
             "inside your window**; neighbouring placements belong to other agents. The `Post "
             "plant` chapters each show a lineup. If your window does not contain a complete "
             "placement, say so in WEAKEST with low confidence."),
        ],
    },
}
