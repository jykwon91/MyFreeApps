"""KILLJOY title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the chapters
dump -- never a plausible-looking invention.

  python make_instructions.py KILLJOY ascent abyss --pack abyss
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_KILLJOY.md
      --video o1_qZPhJjRs --creator "Briiest" --apply

The base doc was written from SC Valorant Guides' `llo9vOgRrFw` -- an ASCENT attack guide whose
chapters are named after their ability and which never deploys an alarmbot. Almost every per-source
claim it makes is false of this source, and a bare map-name swap would restate each one as a fact
about Briiest's footage. The overrides below replace each with what this source's own frames show.

Frame study behind these claims (o1_qZPhJjRs, 2026-09-12): chapter titles and uploader from
dump_chapters.py; captions, abilities, HUD bindings, minimap behaviour and the plant-zone outline
read off contact sheets at 27-30s, 40-255s and 300-620s.
"""

EXAMPLES = {
    ("KILLJOY", "abyss"): {
        "grammar": "**`<Kind> <Area>`** -- a KIND half (`Setups`, `Postplant Lineups`, "
                   "`Initiator Lineups`) and a hyphenated AREA half (`A-Site`, `B-Site`, `Mid`). "
                   "**Not one chapter names an ability**, which is the single most important thing "
                   "to know about this source's titles",
        "examples":
        "`Setups A-Site`, `Setups B-Site`, `Postplant Lineups A-Site`, `Postplant Lineups B-Site`, "
        "`Initiator Lineups B-Site`, `Initiator Lineups Mid`. (`Intro` and `Killjoy Ultimate Spots` "
        "are excluded upstream.) The title gives you the coarse AREA and the KIND of placement -- "
        "which is what the side read hangs on -- and nothing else. **The ability comes from the "
        "equipped device and the deployed object, never from the title**, because the title has no "
        "ability in it to be right or wrong about. Each of these chapters mixes turret, alarmbot "
        "and nanoswarm freely.",

        "replace": [
            # The base doc's tooling block points at the worktree its own run used.
            (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
            # 1440p60 source, not the base doc's 1080p30 -- `--step 0` is twice as fine here, and
            # the base doc's "a release can sit BETWEEN two frames, do not invent sub-frame
            # precision" caveat is calibrated to 33ms. Left unfixed, every nanoswarm THROW on this
            # source would be reported carrying an uncertainty the footage does not actually have.
            ("(`--step 0` = every frame = ~33ms here)", "(`--step 0` = every frame = ~17ms here)"),
            ("`--step 0` \u2014 ~33ms on this source)", "`--step 0` \u2014 ~17ms on this source)"),
        ],

        "bullets": [
            ("- Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\"
             "o1_qZPhJjRs.mp4` -- **2560x1440 @ 59.94fps (60000/1001).** `--step 0` gives you "
             "~16.7ms between frames, so a nanoswarm release CAN be pinned to a single frame on "
             "this source. Do it: pin the earliest frame in which the grenade is unambiguously out "
             "of the hand. The frames are 1440p, so read the device model, the ability icons and "
             "the location readout off a full-res still rather than guessing from a montage tile."),

            ("- Creator: **SC Valorant Guides**",
             "- Creator: **Briiest** -- \"New Radiant Killjoy Guide On Abyss (Setups + Lineups) "
             "Updated\", uploaded 2025-11-27, a single-map guide filmed alone on a custom server "
             "(full HP, a live round timer, no enemies, re-buyable abilities). **This creator "
             "burns a CAPTION onto almost every placement**, in a large serif font across the "
             "lower third -- `Put your Turret in this corner to distract the enemies`, `Put your "
             "first Nanoswarm on the Boxes and the second one left of the Boxes`, `This lineup "
             "clears the area backside Generator`. Those captions routinely NAME THE ABILITY and "
             "often the destination callout, and they are the strongest evidence this source "
             "offers. **Read them and quote them verbatim in NOTES.** There are no drawn arrows, "
             "circles or title plates on this source -- only the caption text."),

            # The trap this source's captions set: they name abilities, which makes it tempting to
            # read one as a label for the placement in front of you. Several name three at once.
            ("**ALARMBOT does not appear on this source**",
             "**ALL THREE of Killjoy's lineup-able abilities appear on this source** -- turret and "
             "alarmbot (both PLACED: 3 events, no `throw`) and nanoswarm (THROWN: 4 events). "
             "Confirm which one is yours from the equipped viewmodel and the deployed object, and "
             "report that. Two discriminators worth more than a glance at the caption: the ability "
             "bar bottom-centre binds **C = nanoswarm, Q = alarmbot, E = turret** (X is the ult), "
             "and a deployed nanoswarm in range puts an **`F DETONATE` prompt** on the HUD, which "
             "neither placed device does. **A single caption here often enumerates SEVERAL "
             "placements of DIFFERENT abilities at once** -- `Put your Alarmbot on this spot and "
             "one Nanoswarm on the right and one behind your Bot` covers three separate "
             "placements, and `Put your Alarmbot here and one Nanoswarm infront of Main and one on "
             "the Generator` covers three more. A caption is therefore a CHAPTER-LEVEL PLAN, not a "
             "label for the placement in your window: quote it, but take the ability from the "
             "device you actually see equipped and deployed."),

            ("Ascent has **green/teal backlit glass panels",
             "Abyss is lit in **cyan and teal throughout** -- backlit wall strips, glowing floor "
             "seams, holo signage and the void-edge glow are native architecture, and any of them "
             "can read as a turret hologram in a montage tile. **The specific trap on this source "
             "is a bright green outlined quadrilateral lying flat on the ground at A Site and at B "
             "Site.** That is VALORANT's own **spike plant-zone boundary**, drawn because the "
             "creator is carrying the Spike (the HUD shows `SPIKE` in the equipment list). It is "
             "in-game geometry -- present continuously, unchanged across weapon swaps, and "
             "identical before and after every placement -- so it is **not** a drawn annotation, "
             "not a placement marker, and not your utility. Verified: it appears only on the two "
             "sites and is absent at A Main, B Main, B Lobby and Mid Bottom. **And carrying the "
             "Spike does NOT make a chapter attacker-side** -- the creator is alone on a custom "
             "server and simply has it in inventory."),

            ("- **THIS IS AN ATTACK GUIDE.**",
             "- **THIS SOURCE IS MIXED-SIDE, and its chapter titles are what tell you which is "
             "which.** Do NOT default to one side. `Setups A-Site` and `Setups B-Site` are "
             "**defender** anchor setups -- devices placed on a site to hold it, which the "
             "captions describe in defensive terms (`If the enemies pushing Site they will get "
             "huge damage`, `If a Jett dashes in, you can block A Main and Boxes`). `Postplant "
             "Lineups A-Site` and `Postplant Lineups B-Site` are **attacker**: a postplant only "
             "exists once your own team has planted. `Initiator Lineups B-Site` and `Initiator "
             "Lineups Mid` are **attacker** too -- utility thrown from outside a space to clear it "
             "before entering. Report the evidence your own window actually gives you and state "
             "confidence; never infer side from the spawn or from the Spike."),

            ("- **Post-plant nanoswarm lineups are TRUE LINEUPS**",
             "- **Postplant and initiator nanoswarm lineups are TRUE LINEUPS**, not free-hand "
             "setups: the throw is made from a fixed body position with the crosshair parked on a "
             "specific spot, so **AIM carries real information -- pin it on the final settled live "
             "aim** and describe in NOTES whatever alignment reference is actually visible under "
             "the crosshair. If there is no identifiable reference -- no corner, edge, painted "
             "mark or skyline feature -- say so plainly rather than naming one that is not there. "
             "The `Setups *` chapters are the opposite case: placed devices at arm's length, where "
             "AIM is simply the surface under the crosshair."),

            ("- **SIDE**: see the Source section",
             "- **SIDE**: take the default from your chapter per the Source section -- `Setups *` "
             "defender, `Postplant Lineups *` and `Initiator Lineups *` attacker -- then justify "
             "it from what your placement actually serves, and lower your confidence if the "
             "footage in your window contradicts the chapter."),

            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout above the minimap**, not off "
             "the title -- it is on and unmodified on this source (`A Lobby`, `A Main`, `B Lobby`, "
             "`B Main`, `B Site`, `Mid Bottom` all observed). On Abyss the readout is the only "
             "thing that separates the two LOBBIES from the two MAINS, which are SEPARATE seeded "
             "zones. The minimap here is **fixed-orientation, not rotating** -- it reads "
             "identically from every position and facing, so it locates you but says nothing about "
             "which way you are looking. There is no FPS counter and no third-party overlay."),

            ("One chapter here (`A Site Post Plant Nanoswarm Lineups`",
             "**EVERY in-scope chapter on this source is grouped.** They run 57 to 137 seconds and "
             "each demonstrates several separate placements back to back, frequently switching "
             "ability between them. A survey pass already split your chapter and handed you a "
             "sub-window containing exactly ONE placement. **Localize only the placement inside "
             "your window.** Neighbouring placements appear immediately before and after it -- "
             "they belong to other agents, and the caption on screen may well be describing one of "
             "theirs. If your window turns out not to contain a complete placement, say so in "
             "WEAKEST with low confidence rather than drifting into a neighbour's."),
        ],
    },
}
