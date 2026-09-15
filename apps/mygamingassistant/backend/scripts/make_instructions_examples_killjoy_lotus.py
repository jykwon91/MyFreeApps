"""KILLJOY x LOTUS title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Split out of make_instructions_examples_killjoy.py per map: that file carries three sources already
and each Killjoy source bucket runs ~100 lines, so one more would push it over the 500-LOC
no-growth line. Same contract as every examples module -- every example is a REAL chapter title
from that exact source -- and make_instructions_data.py merges it with a duplicate-key check.

  python make_instructions.py KILLJOY ascent lotus --pack lotus
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_KILLJOY.md
      --video liSWxxXao-I --creator "Briiest" --apply
"""

EXAMPLES = {
    # Briiest's `liSWxxXao-I` (2026-04-30, after the 12.05 Lotus A-side rework). Frame study
    # 2026-09-14: chapters from yt-dlp; HUD bindings off full-res crops at 30s, 160s and 480s;
    # captions, readout, previews, clouds and the red throw-button circle off a 12-tile sheet 30-700s.
    ("KILLJOY", "lotus"): {
        "grammar": "**`<Kind> <Area>`** -- a KIND half (`Turrets`, `Setups`, `Postplant Lineups`, "
                   "`Initiator Lineups`) and a hyphenated AREA half (`A-Site`, `B-Site`, `C-Site`). "
                   "**Only the `Turrets` chapters name an ability**",
        "examples":
        "`Turrets A-Site`, `Turrets C-Site`, `Setups A-Site`, `Setups B-Site`, `Postplant Lineups "
        "A-Site`, `Postplant Lineups C-Site`, `Initiator Lineups A-Site`, `Initiator Lineups "
        "C-Site`. (`Intro` and `Killjoy Ultimate Spots` are excluded upstream.) The title gives you "
        "the SITE and the KIND of placement -- which is what the side read hangs on. `Turrets` "
        "chapters are runs of turret placements; `Setups` chapters mix turret, alarmbot and "
        "nanoswarm freely; `Lineups` chapters are nanoswarm throws. **Confirm the ability from the "
        "equipped device and the deployed object** in every case.",

        "replace": [
            (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
            ("(`--step 0` = every frame = ~33ms here)", "(`--step 0` = every frame = ~17ms here)"),
            ("`--step 0` \u2014 ~33ms on this source)", "`--step 0` \u2014 ~17ms on this source)"),
        ],

        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "liSWxxXao-I.mp4` -- **2560x1440 @ 59.94fps (60000/1001).** `--step 0` gives you "
             "~16.7ms between frames, so a nanoswarm release CAN be pinned to a single frame on "
             "this source: pin the earliest frame in which the canister is unambiguously out of "
             "the hand. Read the device model, the ability bar and the location readout off a "
             "full-res still rather than a montage tile."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Briiest** -- \"New Radiant Killjoy Guide On Lotus (Setups + Lineups)\", "
             "uploaded 2026-04-30 (after patch 12.05 reworked Lotus's A side), a single-map guide "
             "filmed alone on a custom server (full HP, a live round timer, no enemies). **This "
             "creator burns a CAPTION onto most placements**, in a large serif font across the "
             "lower third -- `This Turret gives info for Tree and Stairs`, `Another Turret for "
             "Main info`. Captions often NAME THE ABILITY and the area it covers, and they are "
             "strong evidence. **Quote them verbatim in NOTES.** The one other editor mark seen: "
             "on postplant chapters a **red circle drawn around one mouse button of the throw "
             "prompt**, marking which click to throw with -- an overlay, never an event."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). "
             "Discriminators worth more than the caption: the ability bar bottom-centre binds **C "
             "= nanoswarm, Q = alarmbot, E = turret** (X is the ult); a held NANOSWARM (a small "
             "canister with an orange domed top and orange eyes) puts a **two-mouse-button throw "
             "prompt above the C slot**; a deployed turret or alarmbot puts a **recall prompt above "
             "its own E or Q slot**; and a deployed nanoswarm in range shows **`F DETONATE`**. "
             "**A caption can cover several placements** -- it is a CHAPTER-LEVEL PLAN, not a label "
             "for the placement in your window: quote it, but take the ability from the device you "
             "see equipped and deployed."),

            ("Ascent has **green/teal backlit glass panels",
             "Lotus is lit with **teal glowing inlays** in its stone walls and doors, native "
             "architecture that can read as a turret hologram in a montage tile. Three things on "
             "this source are NOT your event: (1) the **turret placement preview**, a PINK "
             "hologram over a cyan ring that tracks the crosshair -- that is the AIM; (2) an "
             "**activated nanoswarm**, a pink/purple dome with a cyan rim -- that is the "
             "ACTIVATION, a separate act after the landing; (3) **thin cyan lines drawn flat on the "
             "ground at each site** -- VALORANT's own **spike plant-zone boundary**, drawn because "
             "the creator carries the Spike, present unchanged before and after every placement. "
             "**Carrying the Spike does NOT make a chapter attacker-side** -- the creator is alone "
             "on a custom server and simply has it in inventory."),

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE, and its chapter titles tell you which is which.** Do "
             "NOT default to one side. `Turrets <Site>` and `Setups <Site>` are **defender** -- "
             "devices placed on a site to hold it, which the captions describe as info and "
             "anchoring. `Postplant Lineups <Site>` are **attacker**: a postplant only exists once "
             "your own team has planted. `Initiator Lineups <Site>` are **attacker** too -- "
             "utility thrown from outside a space to clear it before entering. Report the evidence "
             "your own window gives you and state confidence; never infer side from the Spike."),

            ("- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
             "- **Postplant and initiator nanoswarm lineups are TRUE LINEUPS**, not free-hand "
             "setups: the throw is made from a fixed body position with the crosshair parked on a "
             "specific spot, so **AIM carries real information -- pin it on the final settled live "
             "aim** and describe in NOTES whatever alignment reference is actually visible under "
             "the crosshair. If there is none, say so plainly rather than naming one. The "
             "`Turrets` and `Setups` chapters are the opposite case: placed devices at arm's "
             "length, where AIM is simply the surface under the crosshair."),

            ("- **SIDE**: see the Source section",
             "- **SIDE**: take the default from your chapter per the Source section -- `Turrets "
             "*` and `Setups *` defender, `Postplant Lineups *` and `Initiator Lineups *` attacker "
             "-- then justify it from what your placement serves, and lower your confidence if "
             "the footage in your window contradicts the chapter."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout above the minimap**, not off "
             "the title -- it is on and unmodified on this source, top-left (`A Tree`, `A Site`, "
             "`A Rubble`, `B Site`, `B Main`, `C Site`, `C Bend` all observed). The minimap is "
             "**fixed-orientation** -- it locates you but says nothing about which way you face."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**EVERY in-scope chapter on this source is grouped.** They run 28 to 119 seconds and "
             "each demonstrates several separate placements back to back; the `Setups` chapters "
             "also switch ability between them. A survey pass already split your chapter and "
             "handed you a sub-window containing exactly ONE placement. **Localize only the "
             "placement inside your window.** Neighbouring placements belong to other agents, and "
             "the caption on screen may be describing one of theirs. If your window does not "
             "contain a complete placement, say so in WEAKEST with low confidence."),
        ],
    },

    # Chiru's `cvENl2ZCyWQ` (2024-06-19), the SECOND Lotus source -- B and C chapters only, since
    # it predates the 12.05 A-side rework. Frame study 2026-09-14: chapters from yt-dlp; ability bar,
    # held canister, F DETONATE, planted-spike icon and the end-card Subscribe animation off a 9-tile
    # sheet spanning 55-222s.
    ("KILLJOY", "lotus-src2"): {
        "grammar": "**`<Site> <Kind> [<detail>]`** -- a SITE letter, then `Setup <n>` or `Default "
                   "Post plant Lineup`, sometimes with a parenthesised condition. **Not one chapter "
                   "names an ability**",
        "examples":
        "`B Setup 1`, `C Setup 1`, `C Setup 2`, `B Default Post plant Lineup (When Your The Only "
        "One Alive)`, `B Default Post plant Lineup #2 (When Teammate is alive)`, `C Default Post "
        "Plant Lineup`. (The three A chapters are excluded upstream: they were filmed before patch "
        "12.05 reworked Lotus's A side.) The title gives you the SITE and the KIND of placement. "
        "**The ability comes from the device you see, never from the title.** `Setup` chapters mix "
        "turret, alarmbot and nanoswarm; `Post plant` chapters are nanoswarm throws.",

        "replace": [
            (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
            ("(`--step 0` = every frame = ~33ms here)", "(`--step 0` = every frame = ~17ms here)"),
            ("`--step 0` \u2014 ~33ms on this source)", "`--step 0` \u2014 ~17ms on this source)"),
        ],

        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "cvENl2ZCyWQ.mp4` -- **1920x1080 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Chiru** -- \"Killjoy Lotus Guide (Lineups & Setups)\", uploaded "
             "2024-06-19, filmed in a custom game with a `1:40` round timer, a scoreboard and a "
             "network-stats readout across the top-left. **There are NO editor titles, captions, "
             "arrows or ability icons on this source** -- the chapter title is the only label, and "
             "it never names the ability. The one overlay is a **Like/Subscribe animation over the "
             "tail of the final chapter**; it is never an event."),

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

            ("Ascent has **green/teal backlit glass panels",
             "Lotus is lit with **teal glowing inlays** in its stone walls and rotating doors, "
             "native architecture that can read as a turret hologram in a montage tile. The PINK "
             "placement preview is the AIM, never the LANDING; a pink/purple dome is an ACTIVATED "
             "nanoswarm, not its landing. In the post-plant chapters a **planted-spike icon "
             "replaces the round timer** at the top of the HUD -- state, not utility."),

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE, and the chapter KIND tells you which is which.** "
             "`Setup` chapters are **defender** site setups. `Post plant` chapters are "
             "**attacker** -- a post-plant only exists once your own team has planted, and the "
             "planted-spike icon confirms it. Never infer side from the spawn alone."),

            ("- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
             "- **Post-plant nanoswarm lineups are TRUE LINEUPS**, not free-hand setups: the throw "
             "is made from a fixed body position with the crosshair parked on a specific spot, so "
             "**AIM carries real information -- pin it on the final settled live aim** and describe "
             "the alignment reference actually visible under the crosshair. With no editor marks "
             "here, that reference is always a piece of the map itself; if there is none, say so. "
             "The `Setup` chapters are the opposite case: placed devices at arm's length, where "
             "AIM is simply the surface under the crosshair."),

            ("- **SIDE**: see the Source section",
             "- **SIDE**: `Setup` chapters defender, `Post plant` chapters attacker, per the Source "
             "section -- then justify it from what your placement serves."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout above the minimap**, not off "
             "the title -- it is on and unmodified on this source. The title gives you the SITE "
             "only."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**The `Setup` chapters here are grouped**: each (20-26s) places a site setup -- "
             "several devices back to back. A survey pass already split your chapter and handed "
             "you a sub-window containing exactly ONE placement. **Localize only the placement "
             "inside your window**; neighbouring placements belong to other agents. The `Post "
             "plant` chapters each show a lineup. If your window does not contain a complete "
             "placement, say so in WEAKEST with low confidence."),
        ],
    },
}
