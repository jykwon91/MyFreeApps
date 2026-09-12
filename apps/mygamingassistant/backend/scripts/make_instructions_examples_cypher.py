"""CYPHER title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the chapters
dump -- never a plausible-looking invention.

  python make_instructions.py CYPHER ascent abyss --pack abyss
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_CYPHER.md
      --video mLtLqWULAqQ --creator "ItsFlameBTW" --apply

The base doc was written from spawns' `UsfCu5uL3Qs` -- one video covering EVERY map, filmed with a
caption burned over each placement. Most of its per-source claims are false of any other creator,
and a map-name swap would restate them as facts about the new source. The overrides below replace
each one with what this source's own footage shows.
"""

EXAMPLES = {
    ("CYPHER", "abyss"): {
        "grammar": "**`<Area> <Ability>`**, in either order (`A Site Cameras` but also "
                   "`Tripwires for Mid`) -- the AREA half is a site or Mid, never a fine callout, "
                   "and the ability half is plural because the chapter holds several placements",
        "examples":
        "`A Site Cameras`, `A Site Tripwires`, `A Site One Way Cage`, `Cameras for Mid`, "
        "`Tripwires for Mid`, `One Way Cages for Mid`, `B Site Cameras`, `B Site Tripwires`, "
        "`B Site One Way Cage`, `Attack Tripwires`. The title tells you the ability and the coarse "
        "area a whole CHAPTER covers; it says nothing about which spot YOUR window holds -- that "
        "comes from the footage and the in-game location readout. `Attack Tripwires` names the "
        "SIDE, not an area: those are attacker-side flank wires and their area must be read off "
        "the readout like any other row.",
        "replace": [
            # The base doc's tooling block points at the worktree its own run used.
            (r"MyFreeApps-worktrees\mga-cypher", r"MyFreeApps-worktrees\mga-abyss-cypher"),
        ],
        "bullets": [
            ("- Creator: **spawns**",
             "- Creator: **ItsFlameBTW** -- \"Best Cypher Setups for Abyss\", a single-map setups "
             "guide filmed on an empty custom server (full HP, a live round timer, no enemies). "
             "Chapters are grouped by AREA + ABILITY, and the video walks A site, then Mid, then B "
             "site, then a short attacker-side section."),
            # The single most load-bearing override: the base doc tells the localizer to hunt for,
            # and quote, an on-screen caption. This source has none, and an agent told to find the
            # strongest evidence on the source will reach for something else and call it a caption.
            ("- **The creator burns an on-screen CAPTION into each placement**",
             "- **This creator burns NOTHING onto the frame: no captions, no chapter title plates, "
             "no drawn arrows or circles.** The base source for these instructions captioned every "
             "placement; this one does not, so there is no creator-stated intent or technique to "
             "quote, and nothing to fall back on when the footage is ambiguous. Your evidence is "
             "the footage alone -- the equipped device, the deploy, the location readout above the "
             "minimap. Do not report a caption you did not see, and do not promote an editor "
             "flourish or a HUD string into one."),
            ("title. **Per-chapter titles on this source are OFFSET",
             "title. **A chapter here is a clean run of same-ability placements** -- `A Site "
             "Tripwires` really is 154 seconds of trapwires -- so the title's ability is usually "
             "right, and the survey already used it. It is still not proof: chapters run back to "
             "back with no plate between them, so a window at a chapter EDGE can hold the "
             "neighbour's last placement of a different ability."),
            # Abyss has no green doors; the Ascent example would be rewritten into a false claim
            # about a map whose architecture looks nothing like it.
            ("Several maps have **green/teal backlit glass panels",
             "Abyss is lit in **cyan and teal throughout** -- backlit wall strips, holo signage, "
             "glowing floor seams and the void-edge glow are native architecture, and a still of "
             "any of them can read as a deployed cage in a montage tile. A cage is a **translucent "
             "box that BLOOMS into existence** where a thrown device landed -- if the glow is "
             "present before the throw, or is plainly part of a wall, door or floor, it is map "
             "geometry and NOT your landing."),
            ("**NEUROTRAP does not exist on this source**",
             "**If the HUD or a buy string names the ability NEUROTRAP, that is the same ability "
             "as the trapwire** -- a later reword -- and this project's slug for it is "
             "`trapwire`. Report `trapwire` either way; never invent a `neurotrap` slug."),
            ("- Read STAND_LOC off **VALORANT's own location readout above the minimap**",
             "- Read STAND_LOC off **VALORANT's own location readout above the minimap**, not off "
             "the title. The chapter title gives you the ABILITY and a coarse AREA only "
             "(`B Site Tripwires` = B side of the map, trapwires) -- and on this map the readout "
             "is the only thing that separates the two lobbies from the two mains, which are "
             "SEPARATE seeded zones on Abyss."),
            # The base doc's side advice is built on spawns' practice-server spawn quirk. This
            # source is a defender setups guide with one explicitly attacker-side chapter.
            ("- **SIDE**: this is a *setups* guide",
             "- **SIDE**: this is a *setups* guide, so a placement is **defender** unless it is in "
             "the `Attack Tripwires` chapter, which is attacker-side by its own title. Report the "
             "evidence you actually have -- which approach the wire or cam watches, which way the "
             "cage blocks -- and state confidence. Do NOT infer side from the spawn: the demo "
             "player is alone on a custom server and its spawn side is not evidence."),
            ("Unlike the Sova/Fade sources, one chapter here",
             "Unlike the Sova/Fade sources, one chapter here (`A Site Tripwires`, 154 seconds) "
             "demonstrates **several separate placements back to back** -- the long chapters hold "
             "six or more. A survey pass already split that chapter and handed you a sub-window "
             "containing exactly ONE placement. **Localize only the placement inside your window.** "
             "Neighbouring placements appear immediately before and after it -- they belong to "
             "other agents. If your window turns out not to contain a complete placement, say so "
             "in WEAKEST with low confidence rather than drifting into a neighbour's."),
            ("- The HUD is on:",
             "- The HUD is on and unmodified: location readout at top-left beside the minimap, "
             "ability bar bottom-centre (C = trapwire, Q = cyber cage, E = spycam), round timer. "
             "There is **no FPS counter and no third-party overlay** on this source. The custom "
             "server's re-buyable abilities are not a gameplay signal."),
        ],
    },
}
