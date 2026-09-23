"""FADE / PHOENIX x ABYSS title-grammar buckets -- one entry per SOURCE CUT, keyed (AGENT, pack stem).

Abyss had no Fade or Phoenix rows. These buckets derive from the Sunset docs of each agent and
override every claim those docs make about their own creators' footage:

  python make_instructions.py FADE sunset abyss --pack abyss-lnx
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_FADE_SUNSET.md
      --video 7N1Q4SFvaHE --creator LNX --apply
  python make_instructions.py PHOENIX sunset abyss --pack abyss-mada
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_PHOENIX_SUNSET.md
      --video suTAk5BOVnc --creator "NRG mada" --apply

A per-map module for the same reason as the viper_sunset one: the agents' main examples files must
stay under the 500-LOC no-growth line.
"""

_SIDE_FROM_ITEM = (
    "- **SIDE comes from your item's note**, which states what the source's own framing shows (a "
    "title saying Attack / Defense, the player carrying the spike). Report it unless your window "
    "plainly contradicts it, and say so in NOTES if it does. The practice server spawns the demo "
    "player on either side regardless, so spawn-side cues alone are not evidence.")
_REWORK = (
    "- **This footage is POST patch 11.08** (Oct 2025), which reworked B Site (cover and plant "
    "spots) and turned the Mid hallway into part of B Main. Older Abyss footage you may remember "
    "shows a different B side; read the geometry you see, not a remembered layout.")

# The Fade Sunset doc is Tseeky's: titles giving target + side, a HUD-off opening close-up,
# `(Barrier)` caveats, a side read from the title plate. None of that is true of these sources.
_FADE_COMMON = [
    ("**CRITICAL — the chapter title does NOT say which ability",
     "**CRITICAL — the chapter title does NOT say which ability it is.** **YOU must determine the "
     "ability from the LANDING payload**, and your call is what gets stored. Take it seriously "
     "and state confidence — an ability misread ships the lineup under the wrong utility filter."),
    ("**Do NOT report a SIDE.**", _SIDE_FROM_ITEM),
    ("**Two of these callouts do NOT mean", _REWORK),
]
_FADE_REPLACE = [
    ("(60fps).", "(30fps on this source: `--step 0` still means every frame)."),
    ("every frame @60fps, `--step 0`", "every frame, `--step 0`"),
    ("SIDE: <attacker|defender>   (from the ATT/DEF prefix)",
     "SIDE: <attacker|defender>   (from your item's note; flag a contradiction)"),
]

EXAMPLES = {
    # LNX's `7N1Q4SFvaHE` (2026-08-18, 1080p30): an Abyss-only Fade guide, 14 one-lineup chapters.
    ("FADE", "abyss-lnx"): {
        "grammar": "**`Abyss <Attack|Defense> - <A Site|B Site|Mid>`** -- the side and the area "
                   "the haunt serves, never the stand. **TARGET comes from the footage** within "
                   "that area; **STAND comes from your item**, read off VALORANT's location "
                   "readout",
        "examples": "`Abyss Defense - A Site` (three chapters) reveals onto A site, defender "
                    "side; `Abyss Attack - B Site` onto B site, attacker side; `Abyss Defense - "
                    "Mid` and `Abyss Attack - Mid` reveal mid. The same title repeated names "
                    "DIFFERENT lineups into the same area.",
        "replace": _FADE_REPLACE,
        "bullets": [
            ("Creator: **Tseeky**",
             "- Creator: **LNX**, Abyss, filmed in a custom game. Each chapter is ONE lineup and "
             "opens on a ~2s full-screen TITLE CARD (`DEFENSE / A SITE`), then the walk to the "
             "stand spot, the aim, the throw and the reveal. The editor burns a `JUMP-THROW` "
             "caption over jump-throws -- an overlay, never an event, but it states the "
             "technique: report `jump` and say so in NOTES."),
            ("Some titles carry a caveat",
             "- The TITLE CARD is an editor overlay: never pin STAND inside it."),
            ("**TARGET comes from the title; STAND comes from your item**",
             "- **Confirm the target against the footage**: the title names only the area. "
             "Report where the eye actually opens, and flag a genuine contradiction in NOTES."),
        ] + _FADE_COMMON,
    },
    # Frost LIVE's `5yqNa4HIq5Q` (2025-12-25, 1080p30): an all-maps Fade compilation; only its
    # four Abyss chapters (10-59) are in scope.
    ("FADE", "abyss-frost"): {
        "grammar": "**`Fade Lineup Abyss <TARGET> from <STAND>`** -- the title names both ends. "
                   "**TARGET and STAND both come from the title**; confirm them against the "
                   "footage",
        "examples": "`Fade Lineup Abyss A Site (Front) from A Main` reveals the front of A site "
                    "and is thrown from A Main (two chapters, two different lineups); `Fade "
                    "Lineup Abyss B Site from B Lobby` reveals B site from B Lobby (two chapters).",
        "replace": _FADE_REPLACE,
        "bullets": [
            ("Creator: **Tseeky**",
             "- Creator: **Frost LIVE**, an all-maps compilation filmed in a custom game with a "
             "`Client FPS` readout top-left. Each chapter is ONE lineup: the walk to the spot, "
             "the aim, the throw, then the camera follows the orb to the reveal. The creator "
             "sometimes draws a marker onto the alignment point -- an EDITOR overlay, never an "
             "event."),
            ("Some titles carry a caveat",
             "- `(Front)` in a title names the part of the site the reveal covers, not a callout."),
            ("**TARGET comes from the title; STAND comes from your item**",
             "- **TARGET and STAND come from the title**; confirm both against the footage and "
             "VALORANT's own location readout, and flag a genuine contradiction in NOTES."),
        ] + _FADE_COMMON,
    },
    # NRG mada's `suTAk5BOVnc` (2026-09-17, 1080p60): a 24s clip, one molly. The Phoenix Sunset
    # doc describes two other creators; every Source claim is overridden.
    ("PHOENIX", "abyss-mada"): {
        "examples_marker": "**TARGET comes from the lineup's name; STAND comes from your item**",
        "grammar": "**`Abyss Phoenix <TARGET> Punish Molly`** -- the title names the area the "
                   "molly denies. **TARGET comes from the title**, confirmed against the footage; "
                   "**STAND comes from your item** and VALORANT's location readout",
        "examples": "`Abyss Phoenix B Main Punish Molly` burns B Main.",
        "replace": [
            # Headings run straight into their paragraphs here, so a `bullets` override on the
            # heading would swallow the paragraph its own override rewrites; swap the line alone.
            ("## The ability hedge (nic.vallabh source only)", "## The ability"),
            ("## One pair needs an unusually careful description", "## One lineup"),
            ("SIDE: not reported (author-labelled upstream)",
             "SIDE: <attacker|defender>   (from your item's note; flag a contradiction)"),
        ],
        "bullets": [
            ("## TWO sources", "## Source -- one clip"),
            ("`vBZsTtVYfEY` — nic.vallabh",
             "- **`suTAk5BOVnc` -- NRG mada, a single 24s clip.** A Korean-client custom game: "
             "the buy-phase banner reads `구매 단계`, a settings menu flashes on screen mid-clip, "
             "and there are cuts between the stand, the throw and the burning pool. Overlays and "
             "menus are never events."),
            ("`fEiV1zAq1Y4` — Quible",
             "- **The title names the utility** (`Punish Molly`), so the ability should be "
             "`hot-hands`; confirm it from what lands and flag a contradiction in NOTES."),
            ("`vBZsTtVYfEY` never names the utility",
             "**Judge the ability off the LANDING you actually see**: fire on the ground = "
             "hot-hands, a white flash in the air = curveball."),
            ("On the nic.vallabh source a name like",
             "- `Punish` is a role qualifier (a molly that punishes a push), not a callout."),
            ("**Do NOT report a SIDE.**", _SIDE_FROM_ITEM),
            ("**Two of these callouts do NOT mean", _REWORK),
            ("On the Quible source (`fEiV1zAq1Y4`)",
             "The clip holds ONE lineup. If it shows the same throw twice, localize the first "
             "complete one and say so in NOTES."),
        ],
    },
}
