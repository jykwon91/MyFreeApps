"""BRIMSTONE title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the
chapters dump -- never a plausible-looking invention. A bucket describes ONE creator's
grammar, so two sources for the same map are two entries, keyed by their pack stems.

Split per agent so adding a source touches one small file: the combined corpus crossed the
500-LOC growth guard, and BRIMSTONE's sources share a HUD and a title dialect anyway.
"""
from make_instructions_prose import (  # noqa: E402
    TSEEKY_HUD_OFF,
    SIDE_RESOLVED_UPSTREAM,
    HEHE_PLATE,
    BRIM_LANDING,
)

# The base doc's chaptered-source paragraph contrasts this source with "the B3ast Viper
# compilations" -- a claim about another creator's footage, which make_instructions refuses to carry
# into a new bucket. This is the same paragraph with the comparison dropped.
CHAPTERED = (
    "**This source HAS chapters and names.** The chapter title gives you the TARGET, and the STAND "
    "is either in the title or already supplied in your item, so your job is the 4 event spans plus "
    "CONFIRMING that what you see matches the title. If the footage contradicts the title, say so "
    "loudly in NOTES rather than bending the spans to fit."
)

# (AGENT, map) -> the title-grammar paragraph. Every example is a REAL chapter title from that
# exact source, pasted from the chapters dump — never a plausible-looking invention.
EXAMPLES = {
    ("BRIMSTONE", "ascent"): {
        "grammar": "**`<TARGET>`** with no stand in the title — the stand comes from VALORANT's "
                   "own location readout above the minimap, and is already given to you in the "
                   "item",
        "examples":
        "`A Default Plant 1` lands on A Site's default plant spot (thrown from A Main), "
        "`B Corner Plant 3` lands on B Site's corner plant (from Mid Link), `A Gen` lands on A "
        "Site's generator (from A Main), `B Market` lands on the Frutta e Verdura storefront in "
        "Market (from B Main). `A Antiplant 1` / `B Antiplant` DENY an enemy plant and are thrown "
        "from A Rafters and Defender Side Spawn — defender side, unlike everything else here. "
        "**The name you are given may not match the video's own chapter marker.** The chapter "
        "titles for the last ten lineups are wrong or abbreviated — three chapters labelled "
        "`A Default` / `A Dice` / `B Default` are captioned A ANTIPLANT 1 / A ANTIPLANT 2 / "
        "B ANTIPLANT on the creator's title plate. The name in YOUR item came from the plate; "
        "trust it over anything the YouTube chapter bar says.",
    },
    ("BRIMSTONE", "sunset"): {
        "grammar": "**`<TARGET> [n] From <STAND>`** — the clause after **from** names where the "
                   "player STANDS, never what the molly hits. Both are already resolved in your "
                   "item; confirm them against the footage",
        "examples":
        "`A Default 1 From Lobby Fast` LANDS on A site's default plant spot and is THROWN FROM "
        "A Lobby — not on the lobby. `B Default 3 From Market` lands on B SITE, from Market. "
        "`A Anti Plant 1 From A Link` denies a plant on A site. `B Boxes 4 From Boba (Do 1 step "
        "backwards)` lands on B site's boxes, from B Boba — the parenthetical is a positioning "
        "hint, not a callout. `A Execute Molly (Can be used as a post plant lineup too)` and "
        "`A Retake Molly` name the SITE they serve. **Two chapters' on-screen title plates read "
        "only `A SITE` / `B SITE 1`** because this creator splits the plate across two lines "
        "(name on top, `Execute Molly` / `Antiplant Molly` underneath); the name in YOUR item is "
        "the fuller chapter title, which is deliberate.",
        "bullets": [
            ("**SIDE**:",
             "- **Do NOT report a SIDE.** This creator states the utility's ROLE on the second "
             "line of every on-screen title plate — Afterplant and Execute (attacker), Antiplant "
             "and Retake (defender) — so side is already resolved from the author's own words "
             "upstream and is deliberately absent from your item. The practice server spawns the "
             "demo player attacker-side regardless, so spawn-side cues are not evidence."),
            ("**LANDING** =", BRIM_LANDING),
        ],
    },
    ("BRIMSTONE", "lotus"): {
        "grammar": "**`<TARGET> FROM <STAND>`** in all caps — the clause after **FROM** names "
                   "where the player STANDS, never what the molly hits. Both are already resolved "
                   "in your item; confirm them against the footage",
        "examples":
        "`A DEFAULT FROM A LINK` LANDS on A site's default plant spot and is THROWN FROM the mid "
        "link doors — A Link is MID on this map, not A. `A BACKSITE FROM DEFENDER SPAWN` lands "
        "deep on A site. `B PIT FROM B PILLARS` lands in the pit on B site, thrown from B Main. "
        "`B OPEN FROM A DOOR` lands on B site from the A-side corridor — the letter in the STAND "
        "clause says nothing about which site is hit. A leading `(DEFENCIVE)` in parentheses is "
        "this creator's own side label (his spelling), not a callout." + HEHE_PLATE +
        " **On THIS source the plate carries a THIRD line in parentheses naming the TECHNIQUE** — "
        "`(JUMP)`, `(CROUCH)`, `(ULT COMBO)`. Where it is present it is the author telling you the "
        "technique outright: report exactly that (`jump` / `crouch`), do not re-derive it from the "
        "release frames, and do not default to `standing` against it. Where the third line is "
        "ABSENT the author is not claiming anything, so fall back to reading the release motion as "
        "usual. `(ULT COMBO)` describes what the lineup is FOR, not how the molly leaves the hand — "
        "read the technique off the release frames for those and note the ult pairing in NOTES.",
        "bullets": [
            ("**SIDE**:", SIDE_RESOLVED_UPSTREAM),
            ("**LANDING** =", BRIM_LANDING),
        ],
    },
    ("BRIMSTONE", "breeze"): {
        "grammar": "**`<TARGET> from <STAND>`** — the clause after **from** names where the player "
                   "STANDS, never what the molly hits. Both are already resolved in your item; "
                   "confirm them against the footage",
        "examples":
        "`A default from A Lobby` LANDS on A site's default plant spot and is THROWN FROM A Lobby "
        "— not on the lobby. `A center from Mid Pillar` lands in the middle of A site. `A default "
        "from CT` is thrown from DEFENDER SPAWN — this creator writes `CT` for it. `B default "
        "from B Main` lands on B site. The same target appears three times in a row from the same "
        "stand: those are genuinely different alignments, not duplicates, and each has its own "
        "chapter." + HEHE_PLATE +
        " The video ends with a `HEHE XD / THANK YOU FOR WATCHING` outro card — if a chapter's "
        "window runs into it there is no lineup there, and that IS a legitimate 'no throw' report.",
        "bullets": [
            ("**SIDE**:", SIDE_RESOLVED_UPSTREAM),
            ("**LANDING** =", BRIM_LANDING),
        ],
    },
    ("BRIMSTONE", "haven"): {
        "grammar": "**`<STAND> - <TARGET>`** — the REVERSED order: the callout BEFORE the dash is "
                   "where the player stands and the one AFTER it is what the molly hits. Both are "
                   "already resolved in your item; confirm them against the footage",
        "examples":
        "`A Lobby - A Site` is THROWN FROM A Lobby INTO A Site — reading it the other way round "
        "would swap both fields. `Defender Spawn - B Site` is thrown from defender spawn into B. "
        "`B Main - B Site` lands on B. **One title breaks the pattern: `B Main - Stair` names a "
        "target (`Stair`) that is not a callout on this map**, so its target fell back to B Main "
        "and is KNOWN to be wrong — for that chapter, report the callout the molly actually lands "
        "on and say plainly in NOTES that the title's word could not be resolved. A `(n of m in "
        "source)` suffix on a name is the pipeline numbering repeated titles, not the author's.",
        "bullets": [
            ("**SIDE**:", SIDE_RESOLVED_UPSTREAM),
            ("**LANDING** =", BRIM_LANDING),
        ],
    },
    ("BRIMSTONE", "split"): {
        "grammar": "**`<TARGET> Plant [n] [From <STAND>]`** — every chapter is a plant-denial or "
                   "post-plant molly named for the plant spot it covers. Where the title carries "
                   "no `From` clause the stand came from VALORANT's own location readout above "
                   "the minimap and is already in your item",
        "examples":
        "`B Open Plant 1 (Main / Heaven Plant)` lands on B site's open plant spot — the "
        "parenthetical names the plant variants it denies, not a callout. `B Default Plant 2 From "
        "Heaven` lands on B site's default plant; its stand reads Mid Mail in-game even though "
        "the author wrote `Heaven`, and the item carries the in-game reading. `A Open Plant 1 "
        "Fast` and `A Default Plant 1 Fast` both land on A site — `Fast` and `Simple` are speed "
        "adjectives, never callouts. `B Rafter Box Plant` and `B Corner Plant` land ON B site "
        "(the rafter box is a plant spot on the site floor, distinct from the B Rafters position "
        "which is B Main). " + TSEEKY_HUD_OFF +
        " Roughly **+1s to +4s** into each chapter — and **gone by +6s**, which is where the "
        "location readout was read — this source prints a two-line title plate: a short label "
        "like `A SITE 1` over a role line reading `Afterplant Molly` or `Antiplant Molly`. That "
        "role line is ALREADY folded into your item's ability note, so you do not need to re-read "
        "it and must not use it to override the SIDE. Mention the plate only if it plainly "
        "CONTRADICTS your item — that is a real finding and belongs in WEAKEST.",
        "bullets": [
            ("**SIDE**:", SIDE_RESOLVED_UPSTREAM),
            ("**LANDING** =", BRIM_LANDING),
        ],
    },
    # HEHE XD's Abyss video (laUgRg37MPI) does NOT share the Breeze/Lotus HUD: there is no
    # persistent top-right plate. Verified off a 1fps montage of chapter 1, not recalled.
    ("BRIMSTONE", "abyss"): {
        "grammar": "**`<TARGET> from <STAND>`** — the clause after **from** names where the player "
                   "STANDS, never what the molly hits. Both are already resolved in your item; "
                   "confirm them against the footage",
        "examples":
        "`B Open from B Main` LANDS on B site's open plant spot and is THROWN FROM B Main. `A "
        "Default from A Vent` lands on A site's default plant from the vent. `B Safe from CT` and "
        "`A Backsite from CT` are thrown from DEFENDER SPAWN — this creator writes `CT` for it. The "
        "same target from the same stand appears up to three times in a row (`B Open from B Main`, "
        "`A Default from A Lobby`): those are different alignments, not duplicates. **Unlike this "
        "creator's other maps there is NO persistent corner plate here.** Each chapter instead "
        "OPENS with a ~3s four-panel overview card (`POSITION` / `SHOWCASE` / `REFERENCE` / "
        "`RESULT`, an `8 SEC` label and a difficulty badge such as `Easy`) — that card is a "
        "preview, not gameplay; pin nothing inside it. Live play follows: the stand with the HUD "
        "up, then a HUD-OFF close-up of the aim reference with a **red circle painted on it** "
        "(an editor overlay marking the reference point, not a game element), then the HUD returns "
        "for the throw, then a follow-cam of the flight. The follow-cam carries a **red "
        "trajectory line** and a **numeric readout in the BOTTOM-LEFT** in `SS,hh` form that "
        "counts up and freezes (`00,73` ... `08,00`); both are editor overlays — do NOT anchor any "
        "beat to the number and do not report it as flight time. The video ends on an outro card; "
        "a window that runs into it has no lineup there.",
        "bullets": [
            ("**SIDE**:", SIDE_RESOLVED_UPSTREAM),
            ("**LANDING** =", BRIM_LANDING),
            ("**This source HAS chapters and names**", CHAPTERED),
        ],
    },
    # Tseeky's Abyss video (9HdWaEJvxCE). The HUD is UP from the first frame of each chapter here —
    # TSEEKY_HUD_OFF describes this creator's Split source and does NOT apply.
    ("BRIMSTONE", "abyss-2"): {
        "grammar": "**`<TARGET> Molly [n] [qualifier]`** with no stand in the title — the stand "
                   "came from VALORANT's own location readout above the minimap and is already in "
                   "your item",
        "examples":
        "`A Default Molly 1 Easy & Safe` lands on A site's default plant spot; `Easy & Safe`, "
        "`Fast` and `Mid Flank` / `Super Flank` are qualifiers, never callouts. `A Default Anti "
        "Plant Molly 2` DENIES an enemy plant and is thrown from Defender Side Spawn. `A Site "
        "Execute Molly + Ultimate Combo` is an entry molly. **Three chapters titled `B Danger "
        "Plant Molly 1/2/3` carry on-screen plates reading `B CORNER 1/2/3`** — the name in your "
        "item is the plate's; report the callout the molly actually lands on and say in NOTES "
        "which of the two it matches. For the first ~3s of every chapter a two-line plate sits "
        "bottom-left (`A DEFAULT 2` over `Attacker Molly` / `Defender Molly`) with the HUD already "
        "up and the player at the stand — the stand beat can start there. Mid-chapter the editor "
        "ZOOMS into the ability bar to show which mouse button throws; that zoomed frame is an "
        "editor crop, not a HUD-off frame, and the release happens around it. The landing is shown "
        "on a follow-cam.",
        "bullets": [
            ("**SIDE**:",
             "- **Do NOT report a SIDE.** This creator states it on the second line of every "
             "on-screen plate — `Attacker Molly` or `Defender Molly` — so it is already resolved "
             "from the author's own words upstream and is deliberately absent from your item. The "
             "practice server spawns the demo player attacker-side regardless, so spawn-side cues "
             "are not evidence."),
            ("**LANDING** =", BRIM_LANDING),
            ("**This source HAS chapters and names**", CHAPTERED),
        ],
    },
}
