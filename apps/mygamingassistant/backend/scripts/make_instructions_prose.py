"""Prose constants shared verbatim across the per-agent EXAMPLES corpora.

A rule here is hard-won from a real localization failure (the Tseeky HUD-off open, the
placeholder-stand trap, the side-is-upstream contract). Sharing the STRING rather than
re-describing the rule per bucket is the point: a fix lands everywhere at once, and no bucket
can drift into a weaker wording of a rule another bucket already learned.

Imported by make_instructions_examples_<agent>.py. This module imports nothing from them --
the layering is one-way so the per-agent corpora can grow without a cycle.
"""
import tempfile
from pathlib import Path

# The localizer reads the source from the machine's video cache. Render the real path
# at generation time rather than baking one machine's temp dir into the repo.
SRC_CACHE = f"`{Path(tempfile.gettempdir()) / 'mga-debug-source' / '<VID>.mp4'}`"

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
