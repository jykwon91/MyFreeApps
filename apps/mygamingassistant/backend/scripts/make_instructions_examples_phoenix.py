"""PHOENIX title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the
chapters dump -- never a plausible-looking invention. A bucket describes ONE creator's
grammar, so two sources for the same map are two entries, keyed by their pack stems.

Split per agent so adding a source touches one small file: the combined corpus crossed the
500-LOC growth guard, and PHOENIX's sources share a HUD and a title dialect anyway.
"""
from make_instructions_prose import (  # noqa: E402
    SRC_CACHE,
    STAND_IS_PLACEHOLDER,
    SIDE_RESOLVED_UPSTREAM,
    QUIBLE_CAPTION,
)

# (AGENT, map) -> the title-grammar paragraph. Every example is a REAL chapter title from that
# exact source, pasted from the chapters dump — never a plausible-looking invention.
EXAMPLES = {
    ("PHOENIX", "ascent"): {
        "grammar": "**`<TARGET>`**, often with a `(Combo)` suffix — the stand is not in the title, "
                   "it comes from VALORANT's own location readout and is already in your item",
        "examples":
        "`B Default 1` and `B Corner Plant` land on B site's plant spots (thrown from B Main), "
        "`A Orb 1 (Combo)` lands on the A Ultimate Orb, which sits in **A Main**, not on A site "
        "(the fire burns beside the visible teal orb in the A Main corridor), `A Heaven 3 (Combo)` "
        "lands on A Heaven, `B Retake (Combo)` and `A Anti-Plant` name the site they serve. "
        "**A `(Combo)` chapter can contain more than one utility throw** — this agent's kit pairs a "
        "curveball flash with a hot-hands molly, and the creator sometimes demonstrates both inside "
        "one chapter. Localize the throw whose LANDING is at the named target; if you see two "
        "distinct throws, say so explicitly in NOTES and state which one your spans describe, so "
        "the other is not silently lost. **Do not infer a side from this footage.** It is a "
        "cheats-enabled custom lobby: the round-start banner reads `ROUND 2 /////// DEFENDERS` "
        "while the player is standing in A Lobby during the buy phase, so the banner reports the "
        "lobby's round rotation and not what the lineup is for. Side is decided upstream and is "
        "deliberately not in your item.",
        "bullets": [
            ("STAND and TARGET both come from the title",
             "- **TARGET comes from the title; STAND comes from your item**, read off VALORANT's "
             "own location label above the minimap rather than the title. Confirm both against "
             "the footage and flag a genuine contradiction in NOTES."),
            ("SIDE is NOT labelled by these authors",
             "- **Do NOT report a SIDE.** This source never states one, and inferring it from map "
             "geometry is guessing: the same throw is an attacker's post-plant and a defender's "
             "retake depending on context the footage does not show. Side is resolved upstream "
             "from the author's own title vocabulary and is deliberately absent from your item."),
        ],
    },
    # ---- post-Sunset batch: 12 buckets, 4 maps x 3 agents ---------------------------------------
    ("PHOENIX", "haven"): {
        "grammar": "**`<TARGET> - <Attacker|Defender> Molly`** — the part before the dash is the "
                   "TARGET and the part after it is the author's SIDE label plus the ability, not "
                   "a second callout",
        "examples":
        "`A Site - Attacker Molly` lands on A site and is an attacker's molly; `C Site - Defender "
        "Molly` lands on C site, defender side. This creator repeats the same title for every "
        "lineup that shares a target and side, so the pipeline numbered them — a `(3 of 5 in "
        "source)` suffix is that numbering, not the author's words, and it tells you nothing "
        "about the lineup. " + STAND_IS_PLACEHOLDER.lstrip("- ") +
        " **A faint white caption sits at the BOTTOM-CENTRE of every frame repeating the chapter "
        "title verbatim** (`C Site - Defender Molly`). It is up for the whole chapter, so it is a "
        "cheap way to confirm you are looking at the chapter you think you are. It CANNOT "
        "distinguish one repeated-title chapter from another — the caption is identical on all of "
        "them — so never use it to decide a chapter boundary. **Phoenix's ability is visible in "
        "the HAND**: a burning orange fireball held out front means it is EQUIPPED, so a frame "
        "with the rifle up is not the settled aim.",
        "bullets": [
            ("Check the real frame rate",
             f'- Cached video: {SRC_CACHE}. **This source is 60fps** (verified with ffprobe), so the release is wide enough to pin honestly — use `--step 0` and do not widen the THROW window to hedge.'),
            ("Some titles carry a caveat in parentheses",
             "- The only parenthetical you will see is `(n of m in source)`, which the PIPELINE added to separate chapters this creator gave identical titles. It is not the author's words and tells you nothing about the lineup — never treat it as a callout or a variation hint."),
            ("STAND and TARGET both come from the title", STAND_IS_PLACEHOLDER),
            ("SIDE is NOT labelled by these authors", SIDE_RESOLVED_UPSTREAM),
        ],
    },
    ("PHOENIX", "lotus"): {
        "grammar": "**`<TARGET> - <Attacker|Defender> Molly`** — the part before the dash is the "
                   "TARGET and the part after it is the author's SIDE label plus the ability, not "
                   "a second callout",
        "examples":
        "`A Site - Defender Molly` lands on A site, defender side; `C - Attacker Molly` lands on "
        "C site — this creator sometimes drops the word `Site` and a bare letter still means the "
        "site. A `(2 of 3 in source)` suffix is the pipeline numbering repeated titles, not the "
        "author's words. " + STAND_IS_PLACEHOLDER.lstrip("- ") + QUIBLE_CAPTION,
        "bullets": [
            ("Check the real frame rate",
             f'- Cached video: {SRC_CACHE}. **This source is 60fps** (verified with ffprobe), so the release is wide enough to pin honestly — use `--step 0` and do not widen the THROW window to hedge.'),
            ("Some titles carry a caveat in parentheses",
             "- The only parenthetical you will see is `(n of m in source)`, which the PIPELINE added to separate chapters this creator gave identical titles. It is not the author's words and tells you nothing about the lineup — never treat it as a callout or a variation hint."),
            ("STAND and TARGET both come from the title", STAND_IS_PLACEHOLDER),
            ("SIDE is NOT labelled by these authors", SIDE_RESOLVED_UPSTREAM),
        ],
    },
    ("PHOENIX", "split"): {
        "grammar": "**`<TARGET> - <Attacker|Defender> Molly`** — the part before the dash is the "
                   "TARGET and the part after it is the author's SIDE label plus the ability, not "
                   "a second callout",
        "examples":
        "`A Site - Attacker Molly` lands on A site, attacker side; `A Main - Defender Molly` "
        "lands in the A Main corridor, defender side. Ten of the eleven chapters target A, so a "
        "confident B or mid reading is a signal you have the wrong chapter — re-check the "
        "timestamps before reporting it. A `(4 of 6 in source)` suffix is the pipeline numbering "
        "repeated titles, not the author's words. " + STAND_IS_PLACEHOLDER.lstrip("- ")
        + QUIBLE_CAPTION,
        "bullets": [
            ("Check the real frame rate",
             f'- Cached video: {SRC_CACHE}. **This source is 60fps** (verified with ffprobe), so the release is wide enough to pin honestly — use `--step 0` and do not widen the THROW window to hedge.'),
            ("Some titles carry a caveat in parentheses",
             "- The only parenthetical you will see is `(n of m in source)`, which the PIPELINE added to separate chapters this creator gave identical titles. It is not the author's words and tells you nothing about the lineup — never treat it as a callout or a variation hint."),
            ("STAND and TARGET both come from the title", STAND_IS_PLACEHOLDER),
            ("SIDE is NOT labelled by these authors", SIDE_RESOLVED_UPSTREAM),
        ],
    },
    ("PHOENIX", "breeze"): {
        "grammar": "**`<STAND> to <TARGET>`** — the REVERSED order: the callout BEFORE `to` is "
                   "where the player stands and the one AFTER it is what the fire hits. Both are "
                   "already resolved in your item; confirm them against the footage",
        "examples":
        "`A Lobby to A Shop` is THROWN FROM A Lobby INTO A Shop — reading it the other way round "
        "would swap both fields. `A Cubby to A Default Plant` lands on A site's default plant. "
        "`B Half Wall to B Entrance Cubby` is thrown from B site out toward B Main. `B Back Black "
        "Pillar 1 to B Back Black Pillar 2` names two different pillars on B site — the digits "
        "matter. **Three chapters do NOT use this grammar at all**: `The Pillar Play`, `Mid Rush "
        "(Defense)` and `Mid Rush (Attack)` are mid lineups whose stand is not in the title; for "
        "those, report the stand callout you read off the minimap." + QUIBLE_CAPTION,
        "bullets": [
            ("Check the real frame rate",
             f'- Cached video: {SRC_CACHE}. **This source is 60fps** (verified with ffprobe), so the release is wide enough to pin honestly — use `--step 0` and do not widen the THROW window to hedge.'),
            ("Some titles carry a caveat in parentheses",
             '- Two titles carry a parenthetical and both name the SIDE, not a place — `Mid Rush (Defense)` and `Mid Rush (Attack)`. Side is resolved upstream from exactly those words, so they change nothing about your localization.'),
            ("STAND and TARGET both come from the title",
             "- **STAND and TARGET both come from the title on most chapters** — confirm them "
             "against the footage and flag a genuine contradiction in NOTES. On the three "
             "chapters whose title names no stand, the item carries a placeholder; read the real "
             "stand off VALORANT's location label above the minimap and report it as a callout."),
            ("SIDE is NOT labelled by these authors", SIDE_RESOLVED_UPSTREAM),
        ],
    },
}
