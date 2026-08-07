"""Derive a per-(agent, map) localizer instructions file from an existing one.

The instructions files are ~85% agent-general (ability signatures, the 4 events, mode-invariance,
the honesty contract, tooling) and ~15% map/source-specific (which map, which creator, which
callouts, which title-grammar examples). With 21 buckets left, hand-writing a fresh 134-line doc per
bucket invites drift in the GENERAL part — which is where the hard-won rules live. This copies the
source doc and rewrites only the map/source-specific spans, leaving everything else byte-identical,
and prints a full diff so the rewrite is auditable before it is written.

  python make_instructions.py FADE summit ascent [--apply]

Two kinds of rewrite:
  * the map NAME, as a word, anywhere (title line, prose, "the Summit callouts").
  * BLOCKS — a markdown bullet whose first line contains a marker, through its indented
    continuation lines. Callout lists and title-grammar examples wrap across 2-3 lines, so a
    line-at-a-time rewrite would swap the first line and silently leave the rest naming the old
    map's callouts. That is the specific failure this handles.
"""
import difflib
import re
import sys
import tempfile
from pathlib import Path

# The docs are UTF-8 (arrows, em dashes); this console is cp1252 and would die printing the diff.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BE = Path(__file__).resolve().parents[1]  # scripts/ -> backend/

# Callouts belong to the MAP; title grammar belongs to the SOURCE. Keeping them in one dict keyed
# by map alone was wrong the moment a second agent's Ascent source turned up with completely
# different title grammar (Tseeky's Fade uses ATT/DEF prefixes; Tseeky's Brimstone and Bonsai's
# Phoenix use none), so examples are keyed by (agent, map) and fall back to nothing rather than to
# another source's grammar.
# The localizer reads the source from the machine's video cache. Render the real path
# at generation time rather than baking one machine's temp dir into the repo.
SRC_CACHE = f"`{Path(tempfile.gettempdir()) / 'mga-debug-source' / '<VID>.mp4'}`"

MAPS = {
    "ascent": {
        "callouts": (
            "A Main, A Lobby, A Site, A Heaven, A Rafters, A Generator, A Dice, A Wine, A Tree, "
            "A Short, A Garden, Mid / Middle, Mid Link, Mid Cubby, Mid Catwalk, Market, "
            "B Main, B Lobby, B Site, B Stairs, B Boat, B Front, B Back, CT Spawn, T Spawn."
        ),
        "note": (
            "**Market is its own zone on Ascent** — it is neither Mid nor B Main. A title that says "
            "Market in the LEADING callout is a market lineup; a title that says it in parentheses "
            "is not."
        ),
    },
    "sunset": {
        "callouts": (
            "A Main, A Lobby, A Site, A Elbow, A Link, A Alley, Mid / Middle, Mid Top, "
            "Mid Bottom, Mid Courtyard, Mid Tiles, Market (B Market, Market Stairs), "
            "B Main, B Lobby, B Site, B Boba, B Stairs, Attacker Side Spawn, Defender Side Spawn."
        ),
        "note": (
            # NOTE: never name the SOURCE map in here. The final pass rewrites that word to the
            # destination map everywhere, so a sentence like "on Summit A Link maps to mid" comes
            # out as "on Sunset A Link maps to mid" — the exact opposite of the warning intended.
            "**Two of these callouts do NOT mean what other maps trained you to expect.** "
            "**Market is its own zone**, neither Mid nor B Main — the same rule as Ascent. And "
            "**`A Link` is part of A SITE here**, not mid — it sits 0.019 from the A site box. "
            "Elsewhere in this project a `... Link` callout belongs to mid; do not carry that "
            "over. Read every callout against THIS map."
        ),
    },
    "breeze": {
        "callouts": (
            "A Main, A Lobby, A Shop, A Site, A Cubby, A Half Wall, A Pyramids, A Orange, "
            "A Center, A Back Site, A Bridge, A Ramp, Mid / Middle, Mid Top, Mid Bottom, Mid Nest, "
            "Mid Hall, Mid Cannon, Mid Pillar, Mid Wood Doors, Mid Entrance, B Main, B Lobby, "
            "B Tunnel, B Elbow, B Window, B Site, B Back, B Cubby, B Half Wall, "
            "B Pillar / B Back Pillar, Attacker Side Spawn, Defender Side Spawn."
        ),
        "note": (
            "**`A Bridge` and `A Ramp` are the DEFENDER SPAWN side here** — the elevated defender "
            "approach above A, not part of A Main or A Site. A player standing on either is "
            "standing in defender spawn. **The A and B halves each carry their OWN `Cubby` and "
            "`Half Wall`**, so the letter is load-bearing, not decoration; a bare `Pillar` is mid, "
            "but `B Back Pillar` / `B Black Pillar` are on B SITE. `A Shop` is part of A Main."
        ),
    },
    "haven": {
        "callouts": (
            "A Main, A Lobby, A Garden, A Long, A Short, A Tower, A Link, A Site, Mid / Middle, "
            "Mid Courtyard, Mid Window, Mid Doors, A Sewer, C Link, B Site, B Back, C Garage, "
            "C Window, C Long, C Cubby, C Lobby, C Site, Attacker Side Spawn, Defender Side Spawn."
        ),
        "note": (
            "**This map has THREE sites (A, B, C) and no mid zone at all.** What players call "
            "`Middle` / `Mid Courtyard` / `Mid Window` is the A LOBBY zone here, and `Mid Doors` "
            "is C Lobby. **`A Sewer` and `C Link` are the two entrances to B SITE** despite their "
            "A/C names — a throw made from A Sewer is made at B, not at A. `Garden` is unambiguous "
            "(there is only one) and belongs to A Lobby. `C Garage` and `C Window` are their own "
            "garage zone, distinct from C Lobby."
        ),
    },
    "lotus": {
        "callouts": (
            "A Main, A Lobby, A Door, A Root, A Rubble, A Barrier, A Site, A Tree, A Hut, A Top, "
            "A Stairs, A Drop, A Heaven, A Link, Mid / Middle, C Link, B Main, B Pillars, B Site, "
            "B Upper, B Pit, C Main, C Lobby, C Mound, C Waterfall, C Door, C Long, C Site, "
            "C Bend, C Hall, C Gravel, C Pillar, Attacker Side Spawn, Defender Side Spawn."
        ),
        "note": (
            "**This map has THREE sites (A, B, C).** **`A Link` and `C Link` are both MID** — they "
            "are the rotating doors joining the middle to each side, not part of A or C. `A Lobby` "
            "is A MAIN and `C Lobby` is C MAIN (the approach corridors), as are `A Root`, "
            "`A Rubble`, `A Barrier`, `A Door` and `C Mound`, `C Waterfall`, `C Door`, `C Long`. "
            "On the sites themselves: `A Tree`, `A Hut`, `A Top`, `A Drop`, `A Heaven` are A SITE; "
            "`C Bend`, `C Hall`, `C Gravel`, `C Pillar` are C SITE; `B Upper` and `B Pit` are "
            "B SITE while `B Pillars` is B MAIN."
        ),
    },
    "split": {
        "callouts": (
            "A Main, A Lobby, A Ramps, A Sewer, A Site, A Screens, A Tower, A Rafters, A Back, "
            "A Heaven, A Elbow, Mid / Middle, Mid Top, Mid Bottom, Mid Vent, Mid Mail, B Main, "
            "B Lobby, B Garage, B Link, B Stairs, B Tower, B Rafters, B Heaven, B Site, B Alley, "
            "B Back, Attacker Side Spawn, Defender Side Spawn."
        ),
        "note": (
            "**Mail is its own zone** — neither Mid nor B Main; `Mid Mail` and `B Mail` both name "
            "it. **Several landmarks exist TWICE and the letter decides the zone**: `A Tower` is "
            "A SITE but `B Tower` is B MAIN; `A Rafters` is A Site but `B Rafters` is B Main; "
            "`A Heaven` is A Site but `B Heaven` is B Main. A bare `Tower` / `Rafters` / `Heaven` "
            "/ `Back` with no letter is genuinely ambiguous — say so in NOTES instead of picking "
            "one. The A approach (`A Lobby`, `A Ramps`, `A Sewer`) is A MAIN; the B approach "
            "(`B Lobby`, `B Garage`, `B Link`, `B Stairs`) is B MAIN, while `B Alley` and `B Back` "
            "are on B SITE."
        ),
    },
}

# Reused verbatim across every bucket whose item's `stand` is a PLACEHOLDER copy of the target
# (the source's titles name only the target and no in-game readout was carded). Without this the
# localizer reads "stand: c-site, target: c-site" as a fact and never reports the real stand, and
# reconcile's --apply-stand has nothing to apply.
STAND_IS_PLACEHOLDER = (
    "- **The STAND in your item is a PLACEHOLDER, not a fact.** These chapter titles name only the "
    "TARGET, so the pipeline filled the stand with a copy of the target. Read the REAL stand off "
    "VALORANT's own location label above the minimap at the STAND beat and report it as a callout "
    "— that report is the only source for this field. If the readout is not legible in any frame "
    "of the stand window, say so explicitly rather than echoing the target back."
)
# Every Tseeky chapter opens with a HUD-OFF close-up of the aim reference.
TSEEKY_HUD_OFF = (
    "**The first ~4s of every chapter are not gameplay:** this creator opens each one with a "
    "HUD-OFF close-up of the aim reference — no minimap, no ability bar, no location readout, "
    "player not yet in the throwing pose. The HUD returns around **+4.5s** and the real STAND beat "
    "begins there. Do not pin STAND inside that close-up, and do not report the chapter as having "
    "no HUD."
)
SIDE_RESOLVED_UPSTREAM = (
    "- **Do NOT report a SIDE.** It is resolved upstream from the author's own words and is "
    "deliberately absent from your item; where the author said nothing, the row ships "
    "side-unresolved to the operator's review rather than being guessed. The practice server "
    "spawns the demo player attacker-side regardless, so spawn-side cues are not evidence."
)

# HEHE XD's two Brimstone sources (breeze, lotus) share one HUD. Verified off a 50-frame screening
# montage of each, not recalled: the plate is on screen in EVERY sampled frame of every chapter,
# including the aim and the landing.
HEHE_PLATE = (
    " **This creator prints a PERSISTENT plate in the TOP-RIGHT corner** — it is up for the WHOLE "
    "chapter, not a flash at the start, so you can read it from any frame you are already looking "
    "at. Line 1 is the TARGET (`A DEFAULT`, `A CENTER`, `B PIT`), line 2 is `FROM <STAND>` "
    "(`FROM A LOBBY`, `FROM MID PILLAR`, `FROM CT`, `FROM DEFENDER SPAWN`). It is the author's own "
    "statement of both fields and it OUTRANKS any inference you might make from the geometry. If "
    "the plate plainly disagrees with your item's stand or target, say so in NOTES — that is a "
    "real finding, not a nitpick."
    " Two things on screen are EDITOR OVERLAYS and are NOT evidence: a **red trajectory line** "
    "drawn from the crosshair to the impact point (it is painted on, so a frame showing it is not "
    "necessarily the live settled aim), and a **numeric readout in the BOTTOM-LEFT** in `SS,hh` "
    "form (`01,20`, `06,00`, `08,00`). What that number measures has NOT been established — do "
    "NOT anchor any beat to it, and do not report it as flight time."
)

# Quible's three Phoenix sources (breeze, lotus, split). Verified off 50-frame screening montages of
# all three: same faint left-side caption, same intro card, same subscribe bug.
QUIBLE_CAPTION = (
    " **This creator LABELS THE TECHNIQUE on screen.** A faint white caption sits on the LEFT side "
    "of the frame during the throw, reading one of `- Normal Throw`, `- Jump + Throw`, "
    "`- W + Jump + Throw`, `- W + Throw`, or `- W(slightly) + Jump + Throw`. Translate it and "
    "report THAT rather than re-deriving from the release frames: `Normal Throw` -> `standing`; "
    "anything containing `Jump` -> `jump`. The `W` is a forward run-up, not a stance — it does not "
    "change the technique word, so a `W + Throw` is still `standing`; put the run-up in NOTES "
    "because it is genuinely part of reproducing the lineup. The caption is LOW CONTRAST and "
    "easily missed over bright geometry — look for it before concluding the author said nothing, "
    "and if it really is absent, fall back to reading the release motion as usual.\n"
    "  - The same creator also drops longer multi-line commentary captions (`- The Pillar Play`, "
    "`- Best for postplant or 1 v 1`) and an intro card near the very start reading `- works for "
    "both 4:3 & 16:9 Ratio / - All the lineups are tried and tested / - i will share all my secret "
    "settings at 1k subs subscribe`, plus a YouTube subscribe bug. None of those are lineup data.\n"
    "  - **Phoenix's ability is visible in the HAND**: a burning orange fireball held out front "
    "means it is EQUIPPED, so a frame with a rifle or a knife up is NOT the settled aim. Use that "
    "to separate the real AIM from the walk-in."
)

# Written after this exact bucket came back 0/9. The localizers did NOT fail because the source is
# unusable — a 1s strip of one chapter showed the whole STAND -> AIM -> THROW -> LANDING sequence
# plainly. They failed because they were hunting the WRONG landing shot, and several then reported
# "this chapter contains no throw" rather than lowering confidence. That is an instruction defect,
# and this bullet is the fix; do not soften it.
BRIM_LANDING = (
    "- **LANDING** = the FIRST IGNITION FRAME of the fire pool, seen from the THROWING POSITION.\n"
    "  - **Two wrong answers account for nearly every landing failure on Brimstone sources, and\n"
    "    both are easy to walk into.** Read these before you pin anything.\n"
    "  - **WRONG 1 - the projectile still in flight.** A strip showing a glowing orange ember\n"
    "    arcing downrange and getting smaller is the CANISTER, not the landing. If your last\n"
    "    frame is a tiny airborne speck you closed the span too early. The ignition is typically\n"
    "    **~1-3s after release** - keep stepping.\n"
    "  - **WRONG 2 - the editor's post-throw cut.** These creators cut away after the throw to a\n"
    "    DIFFERENT camera: an overhead/bird's-eye showcase of the site, or a walk-up close-up of\n"
    "    the already-burning fire. Tells that you are on the wrong shot: the camera position\n"
    "    jumps, a **melee/knife or a different weapon** is suddenly in hand, or the fire is\n"
    "    already fully grown when the strip opens. Pin the ignition in the ORIGINAL post-throw\n"
    "    shot, before any cut or walk.\n"
    "  - Expect the real ignition to be **SMALL and PARTLY OCCLUDED** - over a roof, behind a\n"
    "    wall, at the far end of a corridor - and sometimes only an orange glow plus a smoke\n"
    "    column rather than a full pool. Step at `--step 0` and take the first orange/yellow\n"
    "    flicker that appears against the geometry.\n"
    "  - **COLOUR: the incendiary pool is NOT plain orange.** It renders as an orange/red fire\n"
    "    field shot through with **purple / magenta / pink speckle and edging**, and at the\n"
    "    ignition frame the purple can dominate before the flames spread. This has been\n"
    "    cross-checked across multiple Brimstone sources - it IS the molly. Do NOT reject a\n"
    "    landing as 'some other ability' because it looks blue-purple-magenta; what distinguishes\n"
    "    a sky-smoke is a **grey/white DOME with no flames**, not the presence of purple.\n"
    "  - **If you cannot find the ignition, that is a LOW-CONFIDENCE landing, not a missing\n"
    "    throw.** Report your best ignition frame, say what blocked the view in WEAKEST, and let\n"
    "    the gate judge it. Reporting `no throw in this chapter` when a throw is visible is the\n"
    "    worst available failure - it discards a real lineup."
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

APPLY = "--apply" in sys.argv


def opt(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


VIDEO, CREATOR = opt("--video"), opt("--creator")
pos = [a for a in sys.argv[1:] if not a.startswith("--")]
if VIDEO:
    pos = [p for p in pos if p != VIDEO]
if CREATOR:
    pos = [p for p in pos if p != CREATOR]
if len(pos) < 3:
    raise SystemExit(__doc__)
AGENT, SRC_MAP, DST_MAP = pos[0], pos[1].lower(), pos[2].lower()

cfg = MAPS.get(DST_MAP)
if cfg is None:
    raise SystemExit(f"ABORT - no callouts for {DST_MAP!r}. Add an entry to MAPS (derive it with "
                     f"`derive_callouts.py {DST_MAP}`) rather than shipping a doc that still lists "
                     f"{SRC_MAP}'s callouts.")
examples = EXAMPLES.get((AGENT, DST_MAP))
if examples is None:
    raise SystemExit(f"ABORT - no title-grammar examples for ({AGENT}, {DST_MAP}). Paste REAL "
                     f"chapter titles from THAT source into EXAMPLES; the {SRC_MAP} examples "
                     f"describe a different source's grammar and would mislead the localizer.")

src = BE / "scripts" / f"LOCALIZE_INSTRUCTIONS_{AGENT}.md"
dst = BE / "scripts" / f"LOCALIZE_INSTRUCTIONS_{AGENT}_{DST_MAP.upper()}.md"
if not src.exists():
    raise SystemExit(f"ABORT - {src} not found")

before = src.read_text(encoding="utf-8")
lines = before.splitlines()


NEW_BLOCK = re.compile(r"^\s*(?:[-*#>]|```|\d+\.)")


def block_span(marker):
    """[start, end) of the markdown block containing `marker`, incl. its wrapped continuation lines.

    Continuation is "not blank and not the start of a new block" — NOT "indented". Markdown wraps
    a bullet's overflow indented but a paragraph's overflow at column 0, and an indent-only rule
    silently kept the old map's example titles while rewriting the sentence that introduced them.
    """
    hits = [i for i, ln in enumerate(lines) if marker in ln]
    if len(hits) != 1:
        raise SystemExit(f"ABORT - marker {marker!r} matched {len(hits)} lines; expected exactly 1. "
                         f"The source doc changed shape - re-check before rewriting it blind.")
    i = hits[0]
    j = i + 1
    while j < len(lines) and lines[j].strip() and not NEW_BLOCK.match(lines[j]):
        j += 1
    return i, j


def wrap(text, width=99, indent="  "):
    out, cur = [], ""
    for word in text.split(" "):
        if cur and len(cur) + 1 + len(word) > width:
            out.append(cur)
            cur = indent + word
        else:
            cur = f"{cur} {word}" if cur else word
    return out + ([cur] if cur else [])


# Rewrite the wrapped blocks first (by index, from the bottom, so earlier spans stay valid).
CALLOUT_MARK = "callouts you may see"
# Finding the block and writing its lead-in are different jobs. The Phoenix doc says "Chapter
# titles on THESE SOURCES read" (it was built from two videos) where the others say "on this
# source", so a single exact string both finds and writes was guaranteed to miss one of them.
# Match on the stable prefix; always write the canonical singular form.
EXAMPLE_FIND = "Chapter titles on th"
EXAMPLE_WRITE = "Chapter titles on this source read"
blocks = []
i, j = block_span(CALLOUT_MARK)
blocks.append((i, j, wrap(f"- {DST_MAP.capitalize()} callouts you may see: {cfg['callouts']}")
               + wrap(f"- {cfg['note']}")))
i, j = block_span(EXAMPLE_FIND)
# The lead-in states the source's title GRAMMAR, so it is source-specific too: the Summit
# Brimstone doc says titles read "<TARGET> from <STAND>", which is false of the Ascent source
# (its titles are bare target names and the stand comes from the in-game readout). Keeping the
# old lead-in and swapping only the examples after "e.g." left a doc whose first clause
# contradicted its own examples. A dict entry replaces the lead-in; a plain string keeps it.
head = lines[i].split(" — e.g.")[0].rstrip()
spec = examples if isinstance(examples, dict) else {}
if spec:
    head = f"{EXAMPLE_WRITE} {spec['grammar']}"
    examples = spec["examples"]
blocks.append((i, j, wrap(f"{head} — e.g. {examples}", indent="")))

# Optional per-source bullet overrides. The source docs carry claims that are true of the video
# they were written from and false elsewhere. The Phoenix doc is the reason this exists: it asserts
# "STAND and TARGET both come from the title" (on Bonsai's Ascent source the stand comes from the
# in-game readout and is supplied in the item) and, worse, "SIDE is NOT labelled by these authors.
# Infer it geometrically" — which is precisely the map-knowledge guessing build_items.py aborts to
# prevent, and which reconcile discards anyway since the pack's side is authoritative. Left in
# place it would have had every subagent producing confident, unfounded side calls.
for marker, replacement in spec.get("bullets", []):
    bi, bj = block_span(marker)
    blocks.append((bi, bj, wrap(replacement)))

# The `## Source — <id> (<creator>)` heading names a DIFFERENT video for every bucket, and nothing
# above rewrites it: the derived Ascent doc still heads itself `3GUKAYiurQk` (the Summit video)
# months after being written for `rrPhSQYLEMg`. It survived because the spawn message passes
# `--video <VID>` explicitly, so the wrong id was never USED — but a doc that names the wrong source
# is exactly the kind of thing a localizer reconciles against when the footage surprises it.
SRC_HEAD = re.compile(r"^(##\s*Source\s*[-–—]\s*)`([^`]+)`(\s*\()([^)]*)(\).*)$")
OLD_VIDEO = None
for i, ln in enumerate(lines):
    m = SRC_HEAD.match(ln)
    if not m:
        continue
    OLD_VIDEO = m.group(2)
    if VIDEO or CREATOR:
        blocks.append((i, i + 1, [f"{m.group(1)}`{VIDEO or OLD_VIDEO}`{m.group(3)}"
                                  f"{CREATOR or m.group(4)}{m.group(5)}"]))
    break

for i, j, repl in sorted(blocks, reverse=True):
    lines[i:j] = repl

# Then the bare map name everywhere it survives.
out = [re.sub(rf"\b{re.escape(SRC_MAP)}\b", DST_MAP.capitalize(), ln, flags=re.I) for ln in lines]
after = "\n".join(out) + "\n"

diff = list(difflib.unified_diff(before.splitlines(), after.splitlines(),
                                 src.name, dst.name, lineterm="", n=1))
print("\n".join(diff) if diff else "(no changes)")

# Guard against the map the caller DECLARED as the source...
stale = [i for i, ln in enumerate(after.splitlines(), 1)
         if re.search(rf"\b{re.escape(SRC_MAP)}\b", ln, re.I)]
if stale:
    raise SystemExit(f"\nABORT - lines {stale} still mention {SRC_MAP!r}")

# ...and, separately, against every OTHER map name, because the declared source map is
# not necessarily the one in the base doc. `src` is always LOCALIZE_INSTRUCTIONS_<AGENT>.md
# — a single base doc written from ONE map — so passing the wrong SRC_MAP rewrites a word
# that was never there and the guard above passes while the base map's name survives
# untouched. That is not hypothetical: `BRIMSTONE ascent haven` (base doc is Summit's)
# emitted four docs headed "Brimstone / Summit" whose bodies were correct for their own
# map, and one of them went out to a 19-agent run before anyone noticed. Checking the
# declared source alone cannot catch that; checking every other map name can.
# Case-SENSITIVE on the capitalised form. Half the pool doubles as ordinary English
# ("split the plate across two lines", "bind", "breeze", "pearl"), so a case-insensitive
# sweep fires on prose and the guard gets disabled as noise. A map is a proper noun and
# is written capitalised everywhere in these docs; the English senses are lowercase.
# "Split-screen TITLE CARD" at the head of the Brimstone base doc is the one capitalised
# false positive, and it is excluded by requiring the name not be hyphen-continued.
# Drawn from the full map pool, NOT from MAPS.keys(): MAPS holds only DESTINATIONS that
# have callouts entered, so the base doc's own map is systematically absent from it. That
# omission is exactly why the first version of this guard passed the bad invocation —
# `summit` is every Brimstone/Phoenix/Fade base doc's map and has no MAPS entry.
MAP_POOL = ("ascent", "bind", "breeze", "fracture", "haven", "icebox", "lotus",
            "pearl", "split", "summit", "sunset", "abyss", "corrode")
others = [m for m in MAP_POOL if m != DST_MAP]
wrong = sorted({(i, m) for i, ln in enumerate(after.splitlines(), 1) for m in others
                if re.search(rf"\b{re.escape(m.capitalize())}\b(?!-)", ln)})
if wrong:
    raise SystemExit(
        "\nABORT - the output still names other map(s): "
        + ", ".join(f"line {i} {m!r}" for i, m in wrong[:8])
        + (f" (+{len(wrong) - 8} more)" if len(wrong) > 8 else "")
        + f"\nThe base doc is {src.name}; pass ITS map as the source, not {SRC_MAP!r}."
    )

# Same fail-loud rule for the source video id. Without it the wrong id survives silently, which is
# how the Ascent doc kept the Summit video's id; with it, a bucket that forgets --video is caught.
if VIDEO and OLD_VIDEO and VIDEO != OLD_VIDEO:
    left = [i for i, ln in enumerate(after.splitlines(), 1) if OLD_VIDEO in ln]
    if left:
        raise SystemExit(f"\nABORT - lines {left} still name the OLD source video {OLD_VIDEO!r}")
if not VIDEO and OLD_VIDEO:
    print(f"\n!! no --video given; this doc still names {OLD_VIDEO!r} as its source. Pass "
          f"--video <ID> [--creator <NAME>] unless the new bucket really is the same video.")
print(f"\n{len(before.splitlines())} -> {len(after.splitlines())} lines; no {SRC_MAP!r} left.")

if not APPLY:
    print("DRY RUN - re-run with --apply to write.")
    sys.exit(0)
dst.write_text(after, encoding="utf-8")
print(f"-> {dst}")
