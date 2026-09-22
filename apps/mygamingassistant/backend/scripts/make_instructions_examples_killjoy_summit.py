"""KILLJOY x SUMMIT title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

A per-map module for the same reason as make_instructions_examples_killjoy_lotus.py: each Killjoy
source bucket runs ~90 lines, and the agent's main examples file must stay under the 500-LOC
no-growth line. Every example is a REAL chapter title from that exact source;
make_instructions_data.py merges this with a duplicate-key check.

  python make_instructions.py KILLJOY ascent summit --pack summit
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_KILLJOY.md
      --video Qoq6I433E-c --creator "Briiest" --apply
"""

_REPLACE_60FPS = [
    (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
    ("(`--step 0` = every frame = ~33ms here)", "(`--step 0` = every frame = ~17ms here)"),
    ("`--step 0` \u2014 ~33ms on this source)", "`--step 0` \u2014 ~17ms on this source)"),
]

_SUMMIT_LOOK = (
    "Ascent has **green/teal backlit glass panels",
    "Summit's signage and posters carry **Chinese characters** -- describe the landmark, never "
    "transcribe the glyphs. The PINK/MAGENTA placement preview over a cyan range ring is the AIM, "
    "never the LANDING; a pink/purple cloud or dome is an ACTIVATED nanoswarm -- a separate act "
    "after the landing, never the landing itself. **Thin cyan lines drawn flat on the ground at "
    "each site** are VALORANT's own spike plant-zone boundary, drawn because the creator carries "
    "the Spike. **Carrying the Spike does NOT make a chapter attacker-side** -- the creator is "
    "alone in a custom game and simply has it in inventory.")

_GROUPED = (
    "One chapter here (`A Site Post Plant Nanoswarm Lineups`",
    "**EVERY in-scope chapter on this source is grouped**: each demonstrates several separate "
    "placements back to back, and the setup chapters also switch ability between them. A survey "
    "pass already split your chapter and handed you a sub-window containing exactly ONE "
    "placement. **Localize only the placement inside your window**; neighbouring placements "
    "belong to other agents. If your window does not contain a complete placement, say so in "
    "WEAKEST with low confidence.")

EXAMPLES = {
    # Briiest's `Qoq6I433E-c` (2026-07-02, client 13.00 -- Summit entered the pool in 13.00).
    # Frame study 2026-09-15: chapters from yt-dlp; HUD binds off a full-res crop at 50s and full
    # frames at 300s, 620s and 690s; captions and the editor's dimmed spotlight shots at 420/450s.
    ("KILLJOY", "summit"): {
        "grammar": "**`<Kind> <Area>`** -- a KIND half (`Turrets`, `Setups`, `Postplant Lineups`, "
                   "`Mid Lurk Postplant Lineups`, `Initiator Lineups`) and a hyphenated AREA half "
                   "(`A-Site`, `B-Site`). **Only the `Turrets` chapters name an ability**",
        "examples":
        "`Turrets A-Site`, `Turrets B-Site`, `Setups A-Site`, `Setups B-Site`, `Postplant Lineups "
        "A-Site`, `Postplant Lineups B-Site`, `Mid Lurk Postplant Lineups`, `Initiator Lineups "
        "A-Site`. (`Intro` and `Killjoy Ultimate Spots` are excluded upstream.) The title gives you "
        "the SITE and the KIND of placement -- which is what the side read hangs on. `Turrets` "
        "chapters are runs of turret placements; `Setups` chapters mix turret, alarmbot and "
        "nanoswarm freely; `Lineups` chapters are nanoswarm throws. **Confirm the ability from the "
        "equipped device and the deployed object** in every case.",
        "replace": _REPLACE_60FPS,
        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "Qoq6I433E-c.mp4` -- **2560x1440 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source. Read "
             "the device model, the ability bar and the location readout off a full-res still "
             "rather than a montage tile."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Briiest** -- \"New Radiant Killjoy Guide On Summit (Setups + Lineups)\", "
             "uploaded 2026-07-02, a single-map guide filmed alone in a custom game (a live round "
             "timer, no enemies). **This creator burns a CAPTION onto most placements**, in a "
             "large serif font across the lower third -- `This Turret gives you early info on Main "
             "and gives info if someone is lurking Mid`. Captions often NAME THE ABILITY and the "
             "area it covers, and they are strong evidence. **Quote them verbatim in NOTES.** On "
             "the postplant chapters the editor sometimes **DIMS the whole frame** to spotlight a "
             "spot -- an overlay, never an event."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). "
             "Discriminators worth more than the caption: the ability bar bottom-centre binds **C "
             "= nanoswarm, Q = alarmbot, E = turret** (X is the ult); a held NANOSWARM (a small "
             "canister with a copper domed top and orange eyes) puts a **two-mouse-button throw "
             "prompt above the C slot**; a deployed turret or alarmbot puts a **recall prompt above "
             "its own E or Q slot**. **A caption can cover several placements** -- it is a "
             "CHAPTER-LEVEL PLAN, not a label for the placement in your window: quote it, but take "
             "the ability from the device you see equipped and deployed."),

            _SUMMIT_LOOK,

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE, and its chapter titles tell you which is which.** Do "
             "NOT default to one side. `Turrets <Site>` and `Setups <Site>` are **defender** -- "
             "devices placed on a site to hold it. `Postplant Lineups <Site>` are **attacker**: a "
             "postplant only exists once your own team has planted. `Mid Lurk Postplant Lineups` "
             "are **attacker** throws from a lurker in mid onto a planted spike, so STAND is in "
             "mid and TARGET is on a site. `Initiator Lineups <Site>` are **attacker** -- utility "
             "thrown from outside a space to clear it before entering."),

            ("- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
             "- **Postplant, mid-lurk and initiator nanoswarm lineups are TRUE LINEUPS**, not "
             "free-hand setups: the throw is made from a fixed body position with the crosshair "
             "parked on a specific spot, so **AIM carries real information -- pin it on the final "
             "settled live aim** and describe in NOTES whatever alignment reference is actually "
             "visible under the crosshair. If there is none, say so plainly rather than naming "
             "one. The `Turrets` and `Setups` chapters are the opposite case: placed devices at "
             "arm's length, where AIM is simply the surface under the crosshair."),

            ("- **SIDE**: see the Source section",
             "- **SIDE**: take the default from your chapter per the Source section -- `Turrets "
             "*` and `Setups *` defender, every `Lineups` chapter attacker -- then justify it from "
             "what your placement serves, and lower your confidence if the footage in your window "
             "contradicts the chapter."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout above the minimap**, not off "
             "the title -- it is on and unmodified on this source, top-left (`A Site`, `A Lobby`, "
             "`Mid Bend` observed). The minimap is **fixed-orientation** -- it locates you but "
             "says nothing about which way you face."),

            _GROUPED,
        ],
    },

    # Reco's `Sa1JTXfaBFY` (2026-08-14, client 13.02), the SECOND Summit source. Frame study
    # 2026-09-15: chapters from yt-dlp; custom-bind ability bar off a full-res HUD crop at 300s and
    # full frames at 100s, 650s and 900s; subtitles, melee-skin sparks and the rotating minimap.
    ("KILLJOY", "summit-src2"): {
        "grammar": "**`<area> <kind>!`** -- all lower-case with a trailing `!`: an AREA (`a boxes`, "
                   "`a link`, `b main`, `b box`, `b deep`, `a`, `b`) and a KIND (`setup`, "
                   "`lineups`, `ultimates`). **Not one chapter names an ability**",
        "examples":
        "`a boxes setup!`, `a link setup!`, `b main setup!`, `b box setup!`, `b deep setup!`, `a "
        "lineups!`, `b lineups!`, `a ultimates!`, `b ultimates!`. (`intro!` is excluded upstream.) "
        "The title gives you the AREA and the KIND of placement. **The ability comes from the "
        "device you see, never from the title.** `setup` chapters mix turret, alarmbot and "
        "nanoswarm; `lineups` chapters are nanoswarm throws; `ultimates` chapters pair the "
        "Lockdown ultimate (out of scope) with other utility.",
        "replace": _REPLACE_60FPS,
        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "Sa1JTXfaBFY.mp4` -- **2560x1440 @ 60fps.** `--step 0` gives you ~16.7ms between "
             "frames, so a nanoswarm release CAN be pinned to a single frame on this source. Read "
             "the ability bar and the location readout off a full-res still, not a montage tile."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Reco** -- \"*NEW* Radiant Killjoy Guide On SUMMIT! (SETUPS + LINEUPS)\", "
             "uploaded 2026-08-14, filmed alone in a custom game (no enemies). No editor titles, arrows or ability icons appear "
             "over the gameplay chapters. **YELLOW burned-in subtitles** of the creator's speech "
             "(`come out here in this corner`) appear on some shots -- narration fragments, useful "
             "context, never an event."),

            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). **THIS "
             "CREATOR PLAYS ON CUSTOM KEYBINDS**: the ability bar bottom-centre reads **MB4 = "
             "nanoswarm, Q = alarmbot, MB5 = turret, X = Lockdown**. Read the slot ICONS, not the "
             "letters -- the triangular swirl is the nanoswarm, the bot with `!?` the alarmbot, "
             "the sentry on a stand the turret, the padlock dome the Lockdown. The creator's "
             "**melee skin** (a kunai-style blade) scatters **PINK/MAGENTA TRIANGLE sparks** and a "
             "small pink orb around the view whenever it is out -- cosmetic, never a preview, "
             "device or cloud."),

            _SUMMIT_LOOK,

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE.** `setup` chapters are **defender** setups for one "
             "area. The `lineups` and `ultimates` chapters state no side: call each placement from "
             "what it serves -- an entry clear or a post-plant is attacker, a retake denial is "
             "defender -- and state your confidence. `HOLD 4 TO PLANT SPIKE` on site only means "
             "the creator carries the Spike."),

            ("- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
             "- **The `lineups` and ultimate-combo nanoswarms are TRUE LINEUPS**, not free-hand "
             "setups: the throw is made from a fixed body position with the crosshair parked on a "
             "specific spot, so **AIM carries real information -- pin it on the final settled live "
             "aim** and describe the alignment reference actually visible under the crosshair. If "
             "there is none, say so plainly rather than naming one. The `setup` chapters are the "
             "opposite case: placed devices at arm's length, where AIM is simply the surface under "
             "the crosshair."),

            ("- **SIDE**: see the Source section",
             "- **SIDE**: `setup` defender; `lineups` and `ultimates` from what the placement "
             "serves, per the Source section."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout above the minimap**, not off "
             "the title -- on this source it sits alone at the top-left corner (`A Site`, `A Main` "
             "observed). The minimap **ROTATES with the view**, so its orientation is not "
             "north-up."),

            _GROUPED,
        ],
    },
}
