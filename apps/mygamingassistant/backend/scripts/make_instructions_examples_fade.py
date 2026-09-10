"""FADE title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the
chapters dump -- never a plausible-looking invention. A bucket describes ONE creator's
grammar, so two sources for the same map are two entries, keyed by their pack stems.

Split per agent so adding a source touches one small file: the combined corpus crossed the
500-LOC growth guard, and FADE's sources share a HUD and a title dialect anyway.
"""
from make_instructions_prose import (  # noqa: E402
    STAND_IS_PLACEHOLDER,
    TSEEKY_HUD_OFF,
    SIDE_RESOLVED_UPSTREAM,
)

# (AGENT, map) -> the title-grammar paragraph. Every example is a REAL chapter title from that
# exact source, pasted from the chapters dump — never a plausible-looking invention.
EXAMPLES = {
    ("FADE", "ascent"): (
        "`ATT A Site 5 Wine` targets A Site (Wine is the landmark it lands on), attacker side; "
        "`DEF B Lobby/Mid Link (Amazing for pushes)` targets B Lobby, defender side; "
        "`DEF Middle Best (Market)` targets Middle — the parenthetical names the neighbouring "
        "landmark, NOT the target. `Retake` / `Support` titles (`DEF A Retake 1 High`, "
        "`DEF B Support 2`) name the SITE they serve — A Retake and A Support are both A Site."
    ),
    ("FADE", "sunset"): {
        "grammar": "**`<TARGET> [n]`** alone — a bare callout for what the eye REVEALS, with no "
                   "stand clause at all. The stand comes from VALORANT's own location readout "
                   "above the minimap and is already resolved in your item",
        "examples":
        "`A Site 1`..`A Site 4` all land on A site from four different stands; `A Main` and `B "
        "Main` land in those corridors. A slash joins two ADJACENT areas one reveal covers, and "
        "the FIRST is the target: `A Main/Elbow` lands in A Main sweeping toward Elbow, `Top Mid/A "
        "Link` lands top mid, `A/Mid Info` and `B/Mid Info` land on the SITE (A and B "
        "respectively) with the reveal catching mid on the way. `Best Middle Reveal`, `Middle 2 "
        "Fast`, `Middle 1..3` are all mid. `A Retake`, `A Support 1/2`, `B Retake 1/2`, `B "
        "Support` name the SITE they serve, not a room called retake. `Fast` and `Best` are "
        "quality/speed adjectives, never callouts.",
        "bullets": [
            ("**TARGET** comes from the title.",
             "- **TARGET comes from the title; STAND comes from your item**, read off VALORANT's "
             "own location label above the minimap rather than the title — these chapter titles "
             "carry no stand clause at all. Confirm both against the footage and flag a genuine "
             "contradiction in NOTES. **The first ~4s of every chapter are not gameplay:** this "
             "creator opens each one with a HUD-OFF close-up of the aim reference — no minimap, no "
             "ability bar, no location readout, player not yet in the throwing pose. The HUD "
             "returns around **+4.5s** and the real STAND beat begins there. Do not pin STAND "
             "inside that close-up, and do not report the chapter as having no HUD."),
            ("**SIDE comes from the",
             "- **Do NOT report a SIDE.** This creator writes the side outright on the second line "
             "of every on-screen title plate — `Attacker Haunt` or `Defender Haunt` — so side is "
             "already resolved from the author's own words upstream and is deliberately absent "
             "from your item. The practice server spawns the demo player attacker-side regardless, "
             "so spawn-side cues are not evidence."),
        ],
    },
    ("FADE", "breeze"): {
        "grammar": "**`<Site|Mid> <Attack|Defense> - <descriptor>`**, in either order — the "
                   "author's own side label is one of the two leading words and the descriptor "
                   "after the dash is prose, not a callout",
        "examples":
        "`Site A Attack - Lineup 1` reveals A site, attacker side; `Defense Site A - Lineup "
        "Retake` reveals A site, defender side — the same two words in the opposite order mean "
        "the same thing. `Mid Attack - Mid Info 1` reveals mid. `Site B Attack - Capture "
        "backsite` reveals deep B. `Lineup`, `Main`, `Capture`, `Info` and `Retake` are "
        "descriptors; the only callout in these titles is the `Site A` / `Site B` / `Mid` part.",
        "bullets": [
            ("Some titles carry a caveat in parentheses",
             '- The descriptor after the dash is prose — `Lineup 1`, `Lineup Main`, `Capture Retake`, `Capture backsite`, `Info mid`. None of it is a callout, and none of it changes the localization.'),
            ("Creator: **Tseeky**",
             "- Creator: **AiltonVG**, filmed in a PRACTICE/custom server. Each chapter is ONE "
             "lineup: position at the stand spot → crosshair placement → the throw → the "
             "landing/reveal at the destination."),
            ("**TARGET** comes from the title.", STAND_IS_PLACEHOLDER),
            ("**SIDE comes from the", SIDE_RESOLVED_UPSTREAM),
        ],
    },
    ("FADE", "haven"): {
        "grammar": "**`<TARGET> [n] [qualifier]`** alone — a bare callout for what the eye "
                   "REVEALS, with no stand clause. The stand comes from VALORANT's own location "
                   "readout above the minimap and is already resolved in your item",
        "examples":
        "`A Long 1`, `A Site 1`..`A Site 5` and `C Site 2`..`C Site 5` all reveal those areas "
        "from a different stand each time. `Middle (from A Garden)` and `Middle (from B Site)` "
        "are the ONLY two titles carrying a stand, and they are separated by it rather than by a "
        "number. `A Retake 1`, `C Push`, `A Early Info`, `A Support/Retake` and `C "
        "Retake/Support 1` name the SITE they serve, not a room called retake — a slash joins two "
        "roles for one lineup, not two places. `God Reveal`, `Post Plant`, `Simple` and `Deep` "
        "are quality adjectives, never callouts. " + TSEEKY_HUD_OFF,
        "bullets": [
            ("Some titles carry a caveat in parentheses",
             '- Two titles carry a parenthetical and both name the STAND: `Middle (from A Garden)` and `Middle (from B Site)`. Everywhere else a slash joins two ROLES for one lineup (`A Support/Retake`, `C Retake/Support 1`), not two places.'),
            ("**TARGET** comes from the title.",
             "- **TARGET comes from the title; STAND comes from your item**, read off VALORANT's "
             "own location label above the minimap rather than the title — these chapter titles "
             "carry no stand clause at all. Confirm both against the footage and flag a genuine "
             "contradiction in NOTES. " + TSEEKY_HUD_OFF),
            ("**SIDE comes from the", SIDE_RESOLVED_UPSTREAM),
        ],
    },
    ("FADE", "lotus"): {
        "grammar": "**`<TARGET> [n] [From <STAND>]`** — where a `From` clause is present it is the "
                   "author's own statement of where the player stands; where it is absent the "
                   "stand came from VALORANT's location readout. Either way it is already "
                   "resolved in your item",
        "examples":
        "`A Main God Reveal (from A Site)` REVEALS the A Main corridor and is thrown FROM A site "
        "— not the reverse. `A Retake 1 From A Heaven` reveals A site. `B Retake From A Link` "
        "reveals B site, thrown from the mid link doors. `A Support 1 (B Rotate)` and `A Support "
        "2 (C Rotate)` reveal A site; the parenthetical names the rotation it watches for, not a "
        "place the utility lands. `C Site God Reveal (Risky, use prowler on the left side first)` "
        "is C site — the parenthetical is advice. **Four chapters' in-game readout disagreed with "
        "the author's own `From` clause and the author was kept** (`A Retake 1 From A Heaven`, "
        "`A Retake 2 From A Main`, `A Main 4 From A Barrier`, `C Main 2 From Waterfall`); if the "
        "footage shows the player somewhere else at the STAND beat, say so in NOTES. "
        + TSEEKY_HUD_OFF,
        "bullets": [
            ("Some titles carry a caveat in parentheses",
             '- Parentheticals here are advice or scope, never a callout — `(Wallbang, 2 variations)`, `(B Rotate)`, `(C Rotate)`, `(Risky, use prowler on the left side first)`, `(Also shows some of A site)`, `(More risky, but shows more heaven and drop)`. The two exceptions are `(from A Site)` and `(from A Lobby)`, which name the STAND.'),
            ("**TARGET** comes from the title.",
             "- **TARGET comes from the title; STAND comes from your item** — from the author's "
             "`From` clause where the title has one, otherwise read off VALORANT's own location "
             "label above the minimap. Confirm both against the footage and flag a genuine "
             "contradiction in NOTES. " + TSEEKY_HUD_OFF),
            ("**SIDE comes from the", SIDE_RESOLVED_UPSTREAM),
        ],
    },
    ("FADE", "split"): {
        "grammar": "**`<TARGET> [n] [qualifier]`** alone — a bare callout for what the eye "
                   "REVEALS, with no stand clause. The stand comes from VALORANT's own location "
                   "readout above the minimap and is already resolved in your item",
        "examples":
        "`A Info Best Reveal`, `A Info 2`..`A Info 5 Mid Round` all reveal A site from a "
        "different stand each time; `B Info 1`, `B Info 2 Simple` reveal B. `A Site (Use when "
        "enemies are pushing site)` reveals A site — the parenthetical is advice. `A Ramp 1` and "
        "`A Ramp 2 Simple` reveal the A Main ramps. `B Site 4 (B split from middle)` reveals B "
        "site and is thrown from Mid Mail — the parenthetical describes the play, and `split` "
        "there is the tactic, not the map. `Middle` and `Mid Info 1 Mid Round` are mid. `A "
        "Retake`/`B Retake` name the SITE they serve. `Close`, `Deep`, `Simple`, `Best` and "
        "`Fast` are adjectives, never callouts. " + TSEEKY_HUD_OFF,
        "bullets": [
            ("Some titles carry a caveat in parentheses",
             '- Parentheticals here are advice or tactic names, never a callout — `(Use when enemies are pushing site)` appears twice and `(B split from middle)` describes the play. In that last one `split` is the tactic, not the map.'),
            ("**TARGET** comes from the title.",
             "- **TARGET comes from the title; STAND comes from your item**, read off VALORANT's "
             "own location label above the minimap rather than the title — these chapter titles "
             "carry no stand clause at all. Confirm both against the footage and flag a genuine "
             "contradiction in NOTES. " + TSEEKY_HUD_OFF),
            ("**SIDE comes from the", SIDE_RESOLVED_UPSTREAM),
        ],
    },
}
