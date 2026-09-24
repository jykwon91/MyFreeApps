"""VIPER / SOVA x ABYSS (post-11.08) title-grammar buckets -- one entry per SOURCE CUT, keyed
(AGENT, pack stem).

Abyss's existing Viper (Tseeky, `abyss`) and Sova (maxWELL `abyss`, Tseeky `abyss-2`) packs are
from June 2024, before patch 11.08 (2025-10-15) reworked B Site and turned the Mid hallway into B
Main. These buckets describe the post-rework re-sources. Viper derives from the Snapiex-built Sunset
doc (as the viper_sunset buckets do), Sova from the generic Tseeky-built SOVA.md (as `abyss-2`
does); every claim either base makes about its own creator's footage is overridden:

  python make_instructions.py VIPER sunset abyss --pack abyss-raion
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_VIPER_SUNSET.md
      --video 1IHb4QNlEBI --creator Raion --apply
  python make_instructions.py VIPER sunset abyss --pack abyss-inuis
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_VIPER_SUNSET.md
      --video Y4EW7dlWmrM --creator "inuis!" --apply
  python make_instructions.py SOVA ascent abyss --pack abyss-yolzy
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_SOVA.md
      --video liTRXcUDWus --creator Yolzy --apply
  python make_instructions.py SOVA ascent abyss --pack abyss-valomate
      --base <main checkout>/scripts/LOCALIZE_INSTRUCTIONS_SOVA.md
      --video KKfmFMV-Yas --creator Valomate --apply

A per-map module for the same reason as the viper_sunset and fade_phoenix_abyss ones: the agents'
main examples files must stay under the 500-LOC no-growth line.
"""
from make_instructions_prose import SRC_CACHE  # noqa: E402

_SIDE_FROM_ITEM = (
    "- **SIDE comes from your item's note**, which states what the source's own framing shows (a "
    "title or section saying Attack / Defense, an on-screen side plate, the player carrying the "
    "spike). Report it unless your window plainly contradicts it, and say so in NOTES if it "
    "does. The practice server spawns the demo player on either side regardless, so spawn-side "
    "cues alone are not evidence.")
_REWORK = (
    "- **This footage is POST patch 11.08** (Oct 2025), which reworked B Site (cover and plant "
    "spots) and turned the Mid hallway into part of B Main. Older Abyss footage you may remember "
    "shows a different B side; read the geometry you see, not a remembered layout.")

# --- VIPER -----------------------------------------------------------------------------------
# Claims in the Snapiex Sunset doc that are false of both Abyss sources, overridden identically.
_VIPER_COMMON = [
    ("## Two rows have a PLACEHOLDER stand",
     "**STAND comes from the footage.** Read it off VALORANT's own location readout (top-left, "
     "above the minimap) at your STAND beat. That readout is transient -- it appears on crossing "
     "into an area and fades -- so report the area you actually see the deploy made from in "
     "STAND_LOC and say in NOTES if it was not legible."),
    ("**A slash joins two adjacent areas",
     "- **Report where the utility actually lands**, not a paraphrase of the title or section "
     "label: a wall's TARGET is the area its line runs through, an orb's or a molly's is where it "
     "blooms or pools."),
    ("**Do NOT report a SIDE", _SIDE_FROM_ITEM),
    # Same correction as the viper_sunset buckets: the toxic screen is aimed first-person.
    ("- **toxic-screen**",
     "- **toxic-screen** -> **THIS ONE IS NOT THROWN.** Viper raises her gauntlet, parks a small "
     "green reticle on a surface while the minimap previews the wall LINE, and fires; a row of "
     "emitters then rises into a tall **WALL of green gas**. Map the events like this and say in "
     "NOTES that you did: **AIM** = the reticle held on its reference, immediately pre-fire; "
     "**THROW** = the **FIRE** -- the frame the reticle and the minimap preview vanish and the arm "
     "thrusts forward (no projectile to follow); **LANDING** = the emitters rising / the gas wall "
     "becoming visible along the line."),
    # The base's three placement-mode sub-bullets sit OUTSIDE the toxic-screen bullet's block
    # (each starts a new list item), so the override above cannot reach them; drop them here
    # rather than ship a doc that states both mechanics.
    ("**AIM** = the placement line being aimed", ""),
    ("**THROW** = the **CONFIRM**", ""),
    ("  - **LANDING** = the emitters rising", ""),
    ("**Two of these callouts do NOT mean", _REWORK),
    ("## Three chapters are COMBOS",
     "**Chapters here are GROUPED.** One chapter demonstrates several separate placements back "
     "to back -- walls, orbs and mollies, often a wall and an orb as one setup. A survey pass "
     "already split the chapter and handed you a sub-window holding exactly ONE placement: "
     "localize only that one, name its ability in ABILITY, and ignore the neighbours."),
]
_VIPER_REPLACE = [
    ("SIDE: not reported (deferred upstream — this source never states one)",
     "SIDE: <attacker|defender>   (from your item's note; flag a contradiction)"),
    ("the first THREE-utility agent on this map", "a THREE-utility agent"),
    ("`sunset-03`", "`abyss-03`"),
    ("for a toxic screen, around the CONFIRM", "for a toxic screen, around the FIRE"),
    ("(or the placement mode still open)", "(or the reticle still held on its surface)"),
    ("the placement CONFIRM;", "the FIRE;"),
]
_VIPER_MARKER = "**TARGET comes from the lineup's name; STAND comes from your item.**"

EXAMPLES = {
    # Raion's `1IHb4QNlEBI` (2026-02-05, 1080p60): an Abyss-only Viper guide in 8 chapters; the
    # six setup chapters (0-884) are in scope, `Tips` and `Outro` are not.
    ("VIPER", "abyss-raion"): {
        "examples_marker": _VIPER_MARKER,
        "grammar": "**`<Kind> <Site>` / `<Site> <Kind>`** -- the side and the area a group of "
                   "setups serves, never one placement. **TARGET and STAND come from the "
                   "footage**: the deploy you see and VALORANT's own location readout",
        "examples": "`Attack B Site`, `Attack A Site`, `Smoke Mid Attack`, `Wall Mid Attack`, "
                    "`Defense B`, `Defense A`. `Attack` chapters are attacker setups, `Defense` "
                    "ones defender; `Smoke` means poison-cloud orbs and `Wall` toxic screens, but "
                    "each chapter mixes utilities -- call each from what deploys.",
        "replace": _VIPER_REPLACE,
        "bullets": [
            ("brackets the utility",
             "- Creator: **Raion**, filmed in a custom game. **No chapter title names one "
             "lineup's utility** -- call it from what deploys. The creator's WEBCAM sits as a "
             "picture-in-picture box at the left under the minimap for the whole video -- an "
             "overlay, never an event. Between placements he sometimes opens the full-screen "
             "in-game MAP (a large map in the centre of frame) or the loadout / settings "
             "screens; those are menus, not a deploy."),
            ("These chapters are long (26-53s)",
             "**Chapters here run 53-210s**, many placements each; your sub-window is one of "
             "them."),
        ] + _VIPER_COMMON,
    },
    # inuis!'s `Y4EW7dlWmrM` (2026-09-06, 1080p60): a 172s Abyss-only clip with NO chapters. Its
    # windows follow the section label the editor burns in top-right.
    ("VIPER", "abyss-inuis"): {
        "examples_marker": _VIPER_MARKER,
        "grammar": "**no chapters** -- your item's name is the editor's burned-in SECTION LABEL "
                   "(top-right), which names a setup, not a placement. **TARGET and STAND come "
                   "from the footage**: the deploy you see and VALORANT's own location readout",
        "examples": "`B Site setup`, `A Site setup`, `A Wall + Orb`, `B Wall + Orb + Exec "
                    "Snakebite`, `Mid Orb (Similar to FF Reazy's)`. `Wall` = toxic-screen, `Orb` "
                    "= poison-cloud, `Snakebite` = snake-bite; `Exec` marks an attacker execute. "
                    "The parenthetical is a credit, never a callout.",
        "replace": _VIPER_REPLACE,
        "bullets": [
            ("brackets the utility",
             "- Creator: **inuis!**, filmed in a custom game, no webcam and no voice-over "
             "captions. **The section label top-right is an EDITOR overlay**, never an event. "
             "The player idles with the melee knife out between placements -- the knife is not "
             "a stance; a STAND begins once the placement is being lined up."),
            ("These chapters are long (26-53s)",
             "**Windows here run 22-71s**, one to several placements each."),
        ] + _VIPER_COMMON,
    },
}

# --- SOVA ------------------------------------------------------------------------------------
# The SOVA.md base is Tseeky's Ascent doc: a title card, a cut-straight-into-the-aim habit and a
# pan-up aim habit, all BY NAME. Every one is overridden per source below.
_SOVA_STAND_TAIL = (
    "Reject any candidate window where the player holds the MELEE knife or another weapon rather "
    "than the bow, or the frames are a zoom demonstration rather than the stance. If the chapter "
    "truly never shows a positioning beat, use the earliest stable window at the throwing spot "
    "with the bow out, and say so in WEAKEST.")
_SOVA_AIM = (
    "- **AIM** = the view SETTLED, bow drawn, **charge and bounce set**, crosshair parked on the "
    "alignment reference, immediately pre-release. On Abyss the map has no ground beyond its "
    "edges, so the reference is usually architectural -- a rooftop tip, an antenna, a platform "
    "corner, a skybox seam -- rather than terrain. ~0.6-1.2s. A SNIPER-SCOPE zoom onto the "
    "reference earlier in the chapter is the creator DEMONSTRATING it, not the aim: the AIM is "
    "the bow drawn on that reference. If the aim is corrected before the loose, the AIM is the "
    "FINAL settled aim immediately before release.")
_SOVA_SIDES = (
    "Sides = **Attacker / Defender**",
    "- Use the callouts below rather than fixture slugs. " + _SIDE_FROM_ITEM[2:] + " "
    + _REWORK[2:])
_SOVA_REPLACE = [
    ("ABILITY: <recon|shock|ult>", "ABILITY: <recon|shock>"),
    ("  - **ULT (Hunter's Fury)** → energy beams sweep along the aimed lane.",
     "  - **ULT (Hunter's Fury)** is OUT OF SCOPE: in a reveal + ult combo, localize the recon "
     "bolt only."),
]

EXAMPLES.update({
    # Yolzy's `liTRXcUDWus` (2026-08-27, 2160p60): an Abyss-only Sova guide, one lineup per
    # chapter, an attacker half then a defender half (section header at 267).
    ("SOVA", "abyss-yolzy"): {
        "grammar": "**`[qualifier] <TARGET> <Reveal|role> [From <STAND>] [*Shock Dart(s)]`** -- "
                   "the destination first, the stand only when a `From` clause names it. "
                   "**TARGET comes from the title**, confirmed against the footage; **STAND comes "
                   "from the `From` clause or, without one, VALORANT's location readout",
        "examples":
        "`Broken A Site Reveal From A Lobby` reveals A site from A Lobby; `Simple Mid Reveal From "
        "B Link` reveals mid from B Link; `INSANE A Main Reveal From Tower` is thrown from a "
        "Tower (read which from the readout -- a bare `Tower` is ambiguous on this map); `Fake B "
        "Site Reveal From Spawn` is a real recon bolt thrown from spawn. `A Main + A Site Reveal` "
        "covers both areas; `B Main Reveal + Nest` reveals B Main including Nest. `*Shock Dart` / "
        "`*Shock Darts` mark shock rows (plural = two darts, ONE lineup): `A Site Post-Plant "
        "*Shock Darts`, `A Site Plant Denial *Shock Darts`, `A Main ULT Orb *Shock Dart` (onto the "
        "ultimate orb pickup). `+ Sova ULT Combo` / `+ ULT Combo` add his ultimate, which is out "
        "of scope. `Broken`, `Simple`, `Fast`, `Best`, `INSANE`, `Early`, `Support`, `Retake`, "
        "`V2`, `2.0` are qualifiers, never callouts.",
        "replace": _SOVA_REPLACE,
        "bullets": [
            ("Cached video:",
             f"- Cached video: {SRC_CACHE.replace('<VID>', 'liTRXcUDWus')} (3840x2160 @ 60fps). "
             f"Genuinely 60fps -- use `--step 0` for the release. Note the **2160p** frame: HUD "
             f"elements sit proportionally where they do at 1080p, but a pixel box carried over "
             f"from another source will be in the wrong place."),
            ("Creator:",
             "- Creator: **Yolzy**, filmed in a custom game. **Every chapter OPENS on a HUD-OFF "
             "close-up of the DESTINATION** with the utility already arriving, under a "
             "bottom-left plate naming the lineup and the side (`A SITE REVEAL FROM A LOBBY` / "
             "`ATTACK`). That is a PREVIEW: no minimap, no ability bar, the player is not at the "
             "stand. Never pin STAND in it and **never pin LANDING to it** -- the real landing "
             "follows the throw later in the chapter. Then gameplay: the walk to the spot, often "
             "an OUTLAW scope zoom onto the reference, the bow aim and the loose; the arrow's "
             "flight and landing are often followed by a HUD-less camera, which is still the "
             "real landing."),
            ("- **STAND** =",
             "- **STAND** = the creator DEMONSTRATING where to stand -- body/feet against a wall "
             "seam, box edge or floor texture, with the location readout and minimap dot "
             "corroborating. ~1.5-3s. **Start looking only AFTER the cut from the preview into "
             "gameplay** (the HUD returning is the tell). " + _SOVA_STAND_TAIL),
            ("- **AIM** =", _SOVA_AIM),
            _SOVA_SIDES,
        ],
    },
    # Valomate's `KKfmFMV-Yas` (2026-07-20, 1080p30): an Abyss-only Sova compilation from the
    # Valomate app, 23 one-lineup chapters, a Japanese-language game client.
    ("SOVA", "abyss-valomate"): {
        "grammar": "**`<LOCATION> <Shock|Recon> Bolt <NN>`** -- the ability, a number, and ONE "
                   "location that may be where the bolt lands OR where it is shot from. **TARGET "
                   "and STAND both come from the footage**; use the title's location as a hint "
                   "for one of them and say in NOTES which it turned out to be",
        "examples":
        "`A Lobby Shock Bolt 01`, `A Main Recon Bolt 02`, `Site A Shock Bolt 03`, `Site B Recon "
        "Bolt 04`, `Mid Recon Bolt 01`, `B-main Recon Bolt 01`. `Site A` / `Site B` mean A SITE / "
        "B SITE; `B-main` is B Main. `Shock Bolt` = shock, `Recon Bolt` = recon. The number "
        "orders the app's own list and is not a count; two chapters share the title `Site B "
        "Shock Bolt 04` and are two different lineups.",
        "replace": _SOVA_REPLACE + [
            ("every frame @60fps, `--step 0`", "every frame, `--step 0`"),
            ("pin it at 60fps", "pin it at every frame (30fps on this source)"),
        ],
        "bullets": [
            ("Cached video:",
             f"- Cached video: {SRC_CACHE.replace('<VID>', 'KKfmFMV-Yas')} (1920x1080 @ 30fps). "
             f"Only 30fps: `--step 0` still means every frame, and the release may fall between "
             f"two frames -- say so in WEAKEST rather than widening the THROW window to hedge."),
            ("Creator:",
             "- Creator: **Valomate** (the Valomate lineups app), filmed in a custom game with a "
             "`Client FPS` readout top-left. **The game client is JAPANESE**: the location "
             "readout above the minimap is katakana (`Aサイト` = A Site, `Bリンク` = B Link, "
             "`Aロビー` = A Lobby, `Bメイン` = B Main, `ミッド` = Mid) -- report the ENGLISH "
             "callout. Two overlays are the app's, not the game's, and neither is an event: a "
             "plate top-left (`SHOCK BOLT • ATTACKER 1 / 23` over the chapter title -- the side "
             "in your item came from it) and a static VALOMATE map inset top-right with the "
             "app's pins. The creator often scopes a sniper rifle and swaps weapons (the melee is "
             "a candy cane) before drawing the bow."),
            ("- **STAND** =",
             "- **STAND** = the creator DEMONSTRATING where to stand -- body/feet against a wall "
             "seam, box edge or floor texture, with the location readout and minimap dot "
             "corroborating. ~1.5-3s. " + _SOVA_STAND_TAIL),
            ("- **AIM** =", _SOVA_AIM),
            _SOVA_SIDES,
        ],
    },
})
