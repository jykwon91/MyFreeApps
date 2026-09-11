"""VIPER title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the chapters
dump -- never a plausible-looking invention. Derive these from the chaptered Sunset doc, not the
generic VIPER.md (which describes B3ast's chapterless compilations and asks the localizer to infer
side from geometry):

  python make_instructions.py VIPER sunset abyss --base scripts/LOCALIZE_INSTRUCTIONS_VIPER_SUNSET.md
      --video VNYjHQrBmoY --creator "Tseeky - Pro Valorant Lineups" --apply

The Sunset doc was written for Snapiex (bracketed utility names, three combo chapters, two
placeholder stands, no side anywhere). Every one of those claims is overridden below with what
Tseeky's Abyss footage shows.
"""

EXAMPLES = {
    ("VIPER", "abyss"): {
        # The Sunset base has no "Chapter titles on this source" paragraph; its grammar lives in
        # this bullet, which the examples paragraph replaces.
        "examples_marker": "**TARGET comes from the lineup's name; STAND comes from your item.**",
        "grammar": "**`<TARGET> [Molly|Wall|Smoke] [n] [qualifiers]`** with no stand in the title "
                   "— **TARGET comes from the title; STAND came from VALORANT's own location "
                   "readout above the minimap and is already in your item.** Confirm both against "
                   "the footage and flag a genuine contradiction in NOTES",
        "examples":
        "`A Bridge Molly 1 Easy & Safe` lands on A site's bridge plant spot and is thrown from A "
        "Lobby; `B Default Molly 3 Nest Safe` is thrown from B Nest. In an ANTIPLANT title the "
        "trailing callout is the STAND and the parenthetical is the spot it denies: `B Antiplant "
        "Molly 3 B Link (Default)` is a defender molly thrown from B Link onto B site's default "
        "plant, `A Antiplant Molly 2 Spawn (Bridge)` is thrown from Defender Side Spawn onto the "
        "bridge plant. `A Site Best Wall 1 Mid` is an attacker wall placed from Mid Bottom. `A "
        "Site Retake Smoke (A Main Smoke)` names the site it serves and, in brackets, what it "
        "smokes — report where it actually lands. `Easy & Safe`, `Fast`, `Safe`, `Flank Heaven "
        "From Mid`, `Good In 1v1`, `One Way`, `Perfect`, `God` and `Simple Smoke For Lineups` are "
        "qualifiers, never callouts.",
        "replace": [
            ("SIDE: not reported (deferred upstream — this source never states one)",
             "SIDE: not reported (author-labelled upstream)"),
        ],
        "bullets": [
            ("brackets the utility",
             "- Creator: **Tseeky**. Each chapter is ONE lineup. For its first ~3s a two-line "
             "title plate sits bottom-left with the HUD already up and the player at or near the "
             "stand: the lineup's short name over the side and utility — `Attacker Molly`, "
             "`Attacker Wall`, `Defender Smoke`. Molly = snake-bite, Wall = toxic-screen, Smoke = "
             "poison-cloud. That plate is where your item's ability came from — trust it and "
             "confirm it against what you see deploy."),
            ("## Three chapters are COMBOS",
             "**One utility per chapter.** This source's three multi-utility `Setup` chapters were "
             "dropped upstream, so every item you are given deploys exactly ONE utility, named on "
             "its plate."),
            ("## Two rows have a PLACEHOLDER stand",
             "**Every row's stand was read from VALORANT's own location label** above the minimap "
             "a couple of seconds into its chapter. The label is transient — it appears on "
             "crossing into an area and fades — so if the player moves before the throw, report "
             "the label at your STAND beat in STAND_LOC and say so in NOTES."),
            ("These chapters are long (26-53s)",
             "**Chapters here run 9-31s** (most 15-25s); budget the coarse pass accordingly."),
            ("**A slash joins two adjacent areas",
             "- **A slash joins two adjacent areas one deploy covers, and the FIRST is the "
             "target**: `A Site / Main God Wall` and `A Site / Mid Wall` are defender walls, both "
             "read from A Site. Report where the wall actually runs."),
            ("**Do NOT report a SIDE — and do not guess one.**",
             "- **Do NOT report a SIDE.** This creator writes it on the second line of every "
             "on-screen title plate — `Attacker Molly`, `Defender Wall`, `Attacker Smoke` — so it "
             "is already resolved from the author's own words upstream and is deliberately absent "
             "from your item. The practice server spawns the demo player attacker-side regardless, "
             "so spawn-side cues are not evidence. Put `not reported (author-labelled upstream)` in "
             "the `side` field."),
            ("Two of these callouts do NOT mean",
             "- **`Danger` is B MAIN in this project's zone table**, as is `B Nest`: `B Danger "
             "Plant Molly` targets the B-main-side corner. Report the callout the utility actually "
             "lands on."),
        ],
    },
}
