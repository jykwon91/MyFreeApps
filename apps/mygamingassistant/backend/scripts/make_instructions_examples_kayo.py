"""KAY-O title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the chapters
dump -- never a plausible-looking invention. Derive these from Tseeky's chaptered Sunset doc, not
the generic KAY-O.md (which describes B3ast's chapterless compilations):

  python make_instructions.py KAY-O sunset abyss --base scripts/LOCALIZE_INSTRUCTIONS_KAY-O_SUNSET.md
      --video bC_GFxeWVjE --creator "Tseeky - Pro Valorant Lineups" --apply

The Sunset doc makes several claims about THAT run (its 41-row failure history, its four
two-variation chapters, the order of its sections) that a map-name swap would silently restate as
facts about Abyss. Each one is overridden below with what the Abyss footage actually shows.
"""

EXAMPLES = {
    ("KAY-O", "abyss"): {
        "grammar": "**`<TARGET> [n] [qualifiers] <Flash|Knife|Molly>`** with no stand in the "
                   "title — the stand came from VALORANT's own location readout above the minimap "
                   "and is already in your item",
        "examples":
        "`A Site 1 Simple Entry Flash` lands on A site and is thrown from A Main. A DEFENDER "
        "flash's title names where the flash GOES, not where it is thrown from: `A Main Flash 1 "
        "One Way Flash` and `B Main Danger Peek Flash` carry readouts of A Site and B Site, so they "
        "are thrown from the site OUT into the main. `Middle 2 Support Flash`, `A Lobby Push Flash "
        "(25 meter rule, just aim to the spot shown)` and `A Retake Knife` name the area the "
        "utility serves. `Self Peek`, `One Way`, `God`, `Support`, `Push`, `Danger Peek`, `Simple "
        "Entry`, `Post Plant`, `Best Spot` and `Slow` are qualifiers, never callouts.",
        "replace": [
            ("`sunset-03`", "`abyss-03`"),
            ("for the four \"(2 variations)\" chapters", "for the three \"(2 variations)\" chapters"),
        ],
        "bullets": [
            ("The video is sectioned by UTILITY",
             "- The video is sectioned by UTILITY: 10 attacker flashes, 14 defender flashes, six "
             "knives, then five plant mollies. Your item's ability comes from the chapter's own "
             "title plate (`Attacker Flash`, `Defender Knife`, `Attacker Molly`); trust it and "
             "confirm it."),
            ("**The first ~4 seconds of every chapter are not gameplay.**",
             "- **The first ~3-4 seconds of every chapter are a HUD-OFF RESULT PREVIEW, not the "
             "lineup.** Under the two-line title plate this creator shows the destination with the "
             "payload typically ALREADY DEPLOYED — a flash already blooming, a knife's suppression "
             "dome already up, a molly device already on the ground — with no minimap, no ability "
             "bar and no location readout. A crossfade around +3.5-4s brings the HUD back with the "
             "player at or walking to the stand. **Never pin LANDING inside that preview**: it "
             "precedes the throw, so it can only ever fail the ordering rule below. The real "
             "LANDING comes after the release."),
            ("**Four chapters demonstrate TWO throws under one title**",
             "- **Three chapters demonstrate TWO throws under one title** — their names say so "
             "explicitly (`B Site 1 God Flash (2 variations)`, `A Site Best Knife (2 variations)`, "
             "`B Site Best Knife (2 variations)`). Localize the FIRST complete one and say in NOTES "
             "that a second variation exists and roughly when, so it is not silently lost."),
            ("**On this creator's Sunset chapters the stand comes LATE",
             "**On this creator's chapters the stand can come LATE — search BACKWARD from the AIM, "
             "never forward from the HUD.** On this creator's sibling KAY/O source the HUD-off "
             "opening was followed by a WALK-IN: the player returned to the spot on foot and only "
             "planted just before aiming, and pinning \"the earliest stable-looking window after "
             "the HUD returns\" put STAND in the middle of that walk — the single largest source of "
             "rejected rows there (5 of 7 failures on the sibling Fade batch, all placed "
             "+4.0..+10.6s into the chapter). So: **localize AIM first, then step backward to the "
             "last frame at which the player is already planted, and take your window ending "
             "there.** Stationary is decided by MOTION, not by how composed the frame looks:"),
            ("**LANDING is where this batch fails",
             "**LANDING is where this creator's KAY/O rows fail — read the next three rules before "
             "you pin it.** On the first 41-row KAY/O run from this creator (a different map), "
             "STAND/AIM/THROW mostly passed and **every single failing row failed on LANDING** (18 "
             "of 18). Three mechanical causes, all avoidable:"),
            ("**TARGET comes from the title; STAND comes from your item**",
             "- **TARGET comes from the title; STAND comes from your item**, read off VALORANT's "
             "own location label above the minimap about +6s into the chapter, once the HUD is "
             "back. The label is transient — it appears on crossing into an area and fades — so if "
             "the player moves before the throw, report the label at your STAND beat in STAND_LOC "
             "and say so in NOTES. Confirm both against the footage and flag a genuine "
             "contradiction in NOTES."),
            ("Two of these callouts do NOT mean",
             "- **`Danger` is B MAIN in this project's zone table**, as is `B Nest`: `B Danger "
             "Plant Molly` targets the B-main-side corner. `Danger Peek` inside a longer title is a "
             "qualifier. Report the callout the utility actually lands on."),
        ],
    },
}
