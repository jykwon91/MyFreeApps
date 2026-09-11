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
    # SECOND source for abyss, derived FROM the bucket above's generated doc:
    #   python make_instructions.py KAY-O abyss abyss --pack abyss-2
    #       --base scripts/LOCALIZE_INSTRUCTIONS_KAY-O_ABYSS.md --video RrywrdMNx4A
    #       --creator "maxWELL Lineup-Larry" --apply
    # Every Tseeky claim that doc makes (HUD-off result preview, 60fps, title plates, walk-in
    # stands, the three "(2 variations)" chapters, the readout at +6s) is false here and is
    # overridden. What replaces it was read off contact sheets of cs=5 and cs=97, plus ffprobe
    # (1920x1080 @ 24/1), and matches maxWELL's Sova Abyss editing where the two overlap.
    ("KAY-O", "abyss-2"): {
        "grammar": "**`<STAND> to <TARGET>`** — the callout BEFORE `to` is where the player "
                   "STANDS and the one AFTER it is where the utility lands. Both are already "
                   "resolved in your item; confirm them against the footage",
        "examples":
        "`A Lobby to A Site` is thrown FROM A Lobby ONTO A Site — reading it the other way round "
        "would swap both fields. `T to B Site` is thrown from the attacker spawn and `CT to B Main` "
        "from the defender spawn. `No.2` marks a second variant from the same stand as an earlier "
        "row (`B Lobby to B Site No.2`, `A Main to A Site No.2`, `A Site to A Main No.2`). **A "
        "`(Knife)`, `(Flash)` or `(Molly)` suffix is OURS, not the author's**: the author's chapter "
        "titles carry a section prefix (`ZERO/point:`, `FLASH/drive:`, `FRAG/ment:`) that was "
        "stripped upstream, and four titles collided once it was gone (`B Lobby to B Site`, `Top "
        "Mid to Bottom Mid`, `B Site to B Main`, `A Site to A Main`). The suffix names the "
        "utility, never a place. `A Default`, `B Default`, `B Box`, `B Under`, `B Backsite`, `A "
        "Heaven` and `A Bridge` are spots the author names as destinations; report the callout the "
        "utility actually lands on.",
        "replace": [
            ("Pin at 60fps — NEVER off a coarse frame.",
             "This source is 24fps, so each frame is ~42ms: pin the first frame the device is out of "
             "hand with `--step 0`, and NEVER off a coarse frame."),
            ("every frame @60fps", "every frame @24fps"),
            ("— pin it at 60fps.", "— pin it frame-exact at 24fps."),
            ("this creator uses white/purple crossfade wipes",
             "this creator joins shots with hard cuts AND cross-dissolves (a dissolve shows two "
             "superimposed HUDs)"),
            ("(say so explicitly for the three \"(2 variations)\" chapters)",
             "(say so explicitly if the chapter shows a second throw)"),
        ],
        "bullets": [
            ("**This source is NOT the chapterless",
             "**This source is NOT the chapterless KAY/O compilation the generic doc describes.** "
             "Do not carry that doc's \"you must infer everything\" premise over. Here the creator "
             "supplies a chaptered video whose titles name the stand and the target, filed under "
             "the author's own section headers for side and utility, so the NAME, ABILITY, SIDE and "
             "STAND have all been resolved upstream from the author's own words. **Your job is the "
             "four spans, plus confirming the ability against what you actually see land.**"),
            ("Cached video:",
             "- Cached video: `C:\\Users\\jason\\AppData\\Local\\Temp\\mga-debug-source\\<VID>.mp4` "
             "(1920x1080 @ **24fps**, verified with ffprobe). Every frame is ~42ms, so the release "
             "falls on a coarser grid than the 60fps sources: pin it to the first frame the device "
             "is out of hand and do not claim sub-frame precision."),
            ("Creator:",
             "- Creator: **maxWELL Lineup-Larry**, Abyss, filmed in a PRACTICE/custom server. The HUD "
             "is live from the first frame (minimap, ability bar, location readout) — but **do NOT "
             "take that as licence to pin STAND at the chapter's first stable moment.** Every "
             "chapter opens with an EDITOR FLOURISH: the player idles with the **MELEE knife** out, "
             "often at a blank wall with no landmark. That is not the throwing spot and carries no "
             "spot evidence. **KAY/O's ZERO/point is ALSO a blade — do not mistake the melee for "
             "it.** The melee is the long flat sword KAY/O idles with; ZERO/point is the ability, "
             "drawn from the ability bar (its slot lights) as a glowing energy blade. The tell that "
             "the demo has begun is the swap from the melee to the ABILITY in hand."),
            ("The video is sectioned by UTILITY",
             "- The video is sectioned by SIDE, then by UTILITY, in the author's own chapter list: "
             "an `Attack` half (four ZERO/point knives, six FLASH/drive flashes, six FRAG/ment "
             "mollies) and a `Defense` half (four knives, six flashes, four mollies). Your item's "
             "ability comes from that section header; trust it and confirm it from what lands."),
            ("**The first ~3-4 seconds of every chapter are a HUD-OFF",
             "- **Four overlays are the author's, not the game's, and none is evidence of an "
             "event.** (1) A lower-third **`From <X> / To <Y>` banner** (e.g. `From A-Lobby / To "
             "A-Site`): corroboration for stand and target, but a label, not footage. (2) An "
             "**Operator-scope alignment shot**: on some chapters the author scopes an Operator to "
             "show the aim point before switching to the ability. That is NOT the AIM — no ability "
             "is in hand. (3) **Punch-in zooms** onto the ability bar and crosshair area, sometimes "
             "with a drawn red circle on the aim reference: a teaching aside, never a STAND or an "
             "AIM window. (4) A **prose caption** on the right (`to rush A-SITE`, `to take A-MAIN "
             "CONTROL`) and an animated **like / subscribe / bell** bar at the bottom centre, which "
             "can sit over the destination during LANDING. Never pin LANDING to a caption, and note "
             "in WEAKEST if a caption is the only thing suggesting an outcome you could not see."),
            ("**Three chapters demonstrate TWO throws under one title**",
             "- **One chapter, one throw.** A second variant from the same stand is its own chapter "
             "with a `No.2` title, not a second throw in this window. If your window does show two "
             "throws, localize the first complete one and say so in NOTES."),
            ("**On this creator's chapters the stand can come LATE",
             "**Start looking for the stand AFTER the melee→ability swap, not at the top of the "
             "chapter** — a STAND pinned inside the opening knife idle or the Operator-scope shot "
             "has no spot evidence. Localizing AIM first and stepping backward to the last frame at "
             "which the player is already planted is the reliable order. Stationary is decided by "
             "MOTION, not by how composed the frame looks:"),
            ("- **AIM** = the view SETTLED",
             "- **AIM** = the view SETTLED, the FLASH/drive grenade (or ZERO/point blade / FRAG/ment "
             "hex device) EQUIPPED in hand, crosshair parked on the alignment reference, "
             "immediately pre-release. ~0.6-1.2s. **The Operator-scope shot and any punch-in zoom "
             "are editor asides — the AIM is the FINAL settled LIVE aim with the ABILITY in hand, "
             "right before release.** If the only settled aim you can find is inside a punch-in, "
             "say so in WEAKEST."),
            ("**LANDING is where this creator's KAY/O rows fail",
             "**LANDING is where KAY/O rows fail — read the next three rules before you pin it.** On "
             "an earlier 41-row KAY/O run from another creator, STAND/AIM/THROW mostly passed and "
             "**every single failing row failed on LANDING** (18 of 18). The three causes are "
             "mechanical, not specific to that creator:"),
            ("**TARGET comes from the title; STAND comes from your item**",
             "- **STAND and TARGET both come from the title** — the callout before `to` and the one "
             "after it — and are already in your item. `T` is the attacker spawn and `CT` the "
             "defender spawn. Corroborate the stand against VALORANT's location label above the "
             "minimap and the `From` banner, and flag a genuine contradiction in NOTES."),
            ("**Do NOT report a SIDE.**",
             "- **Do NOT report a SIDE.** This source prints no side on screen; the author's own "
             "chapter list files every lineup under an `Attack` or a `Defense` section header, and "
             "side is already resolved from that upstream and deliberately absent from your item. "
             "The practice server spawns the demo player attacker-side regardless, so spawn-side "
             "cues are not evidence. The output schema still has a `side` field: put `not reported "
             "(author-labelled upstream)` in it."),
            ("**`Danger` is B MAIN in this project's zone table**",
             "- **Report the callout the utility actually lands on**, not the one the title or "
             "banner promises, and flag any disagreement between them in NOTES."),
        ],
    },
}
