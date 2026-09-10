"""The corpus make_instructions.py rewrites documents WITH: per-map callouts + per-source grammar.

Split out of make_instructions.py because only the corpus grows -- the rewrite LOGIC is stable, and
every new bucket was pushing a stable file back over the size guard. The corpus itself then crossed
it too, so the per-source half now lives in make_instructions_examples_<agent>.py (one small file
per agent) and the shared prose those buckets quote lives in make_instructions_prose.py.

This module is the single import point: make_instructions.py still does
`from make_instructions_data import EXAMPLES, MAPS` and neither knows nor cares how many files the
corpus spans. MAPS stays here because a callout table is per-MAP, not per-agent -- every agent's
buckets read the same one.

Sibling imports: these scripts run as `python scripts/make_instructions.py`, so scripts/ is
sys.path[0].
"""

from make_instructions_examples_brimstone import EXAMPLES as _BRIMSTONE  # noqa: E402
from make_instructions_examples_fade import EXAMPLES as _FADE  # noqa: E402
from make_instructions_examples_phoenix import EXAMPLES as _PHOENIX  # noqa: E402
from make_instructions_examples_sova import EXAMPLES as _SOVA  # noqa: E402

# map slug -> the callout vocabulary + the map's own gotchas. Per-MAP, shared by every agent.
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
    "abyss": {
        "callouts": (
            "A Main, A Lobby, A Site, A Bridge, A Tower, A Link, A Security, A Secret, A Vent, "
            "A Default, A Backsite, Mid / Middle, Mid Top / Top Mid, Mid Bottom / Bottom Mid, "
            "Mid Catwalk, Mid Library, Mid Bend, B Main, B Lobby, B Site, B Tower, B Heaven, "
            "B Nest, B Danger, B Link, B Window, B Rope, B Default, B Backsite, "
            "Attacker Side Spawn, Defender Side Spawn."
        ),
        "note": (
            "**A Lobby and B Lobby are their OWN zones here** — the map seeds both, and Riot's "
            "own A Lobby / B Lobby coordinates land inside them, so a lobby callout must NOT be "
            "folded into A Main / B Main. **The two Links are NOT symmetric**: `A Link` is A "
            "SITE, but `B Link` is MID — do not reason from one to the other. `A Vent` is MID "
            "(it is the mid→A connector, entered from mid) even though the letter suggests A. "
            "`B Heaven` is the community name for Riot's `B Tower` and is B SITE, while "
            "`B Nest` and `B Danger` are B MAIN. `B Window` and `B Rope` name features OF B "
            "Main rather than areas of their own. A bare `Tower`, `Link`, `Default` or "
            "`Backsite` with no letter is genuinely ambiguous — this map carries both an A and "
            "a B version of each and they resolve to different zones, so say so in NOTES "
            "instead of picking one."
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

# One flat (AGENT, pack stem) -> bucket mapping, assembled from the per-agent corpora. The
# collision check is not ceremony: two agent files defining the same key would silently let one
# win, and the loser's source would then be localized against another creator's title grammar --
# the exact failure the per-source keying exists to prevent.
EXAMPLES: dict[tuple[str, str], object] = {}
for _part in (_BRIMSTONE, _FADE, _PHOENIX, _SOVA):
    _dupes = EXAMPLES.keys() & _part.keys()
    if _dupes:
        raise SystemExit(f"ABORT - duplicate EXAMPLES key(s) across agent corpora: {sorted(_dupes)}")
    EXAMPLES.update(_part)
