"""AIM-localization system-prompt body.

Extracted from :mod:`aim_timing_classifier` per
apps/mygamingassistant/CLAUDE.md "Tech Debt Policy" (no-growth on files
already over 500 LOC -> split into a sibling module + import back). The
classifier crossed the 500-LOC growth guard, and ~240 of those lines were
this single prompt constant. It lives here as pure text -- no logic -- and
the classifier formats and sends it. Keeping it in its own module also
lets prompt-iteration diffs stand alone from code-path changes.
"""
from __future__ import annotations

AIM_TIMING_SCHEMA_DOC = """\
You are given {n} numbered frames (Frame 1 .. Frame {n}) sampled in time
order from the PRE-WINDUP portion of ONE chapter of a tactical-FPS lineup
tutorial. The chapter teaches ONE utility throw; the narrator typically
SHOWS where to stand, SHOWS where to aim, then THROWS (the throw itself
is past these frames — these frames are BEFORE the windup begins).

Your ONLY job is to locate the AIM demonstration — the frame that best
shows the LOCKED AIM the thrower should reproduce.

Return ONLY bare JSON — no markdown fences, no preamble — with exactly:
{{
  "has_aim_demonstration": boolean,
  "aim_index": integer (1-{n}) or null,
  "confidence": number (0.0-1.0),
  "reasoning": string (<= 80 words)
}}

WHAT COUNTS AS AN AIM DEMONSTRATION
An aim-demo frame's SUBJECT is the AIM TARGET — a specific landmark in
the world the crosshair is locked onto. The narrator is typically:
  - Standing still at the throwing spot, crosshair held on a specific
    landmark (window pixel, antenna tip, ledge corner, skybox feature,
    pixel-perfect alignment mark).
  - View often TILTED UP toward a sky/tower/rooftop landmark; the
    narrator's hands and utility may sit BELOW the bottom of the frame
    when the camera is angled up far enough — this is normal, not a
    disqualifier (see POSITIVE AIM CUES below).
  - HUD may overlay the target ("AIM HERE", crosshair circle, arrow on
    the landmark, ALIGN-PIXEL marker).
All valid.

POSITIVE AIM CUES (ranked — primary cue outranks the others)
  1. PRIMARY: crosshair locked on a far landmark used as an aim
     reference (window pixel, antenna, ledge, sky/tower, rooftop,
     skybox feature). A locked crosshair on a clear landmark IS the
     aim demo — hand visibility is secondary.
  2. Tight composition centred on the aim landmark — minimal camera
     motion, view stable over several frames.
  3. HUD callouts naming/pointing at the aim target ("AIM HERE",
     arrow on landmark, ALIGN-PIXEL annotation).
  4. Pixel-alignment marks / on-screen reticle annotation.
  5. Latest "settled" frame BEFORE any windup motion begins.
  6. Utility visible in hand in READY pose, when present — NEUTRAL
     when absent. The narrator may tilt the camera up so the hands
     leave the bottom of the frame; that does NOT disqualify the
     frame. A crosshair-on-landmark frame with no visible hands IS
     a valid aim-demo composition.

CRITICAL — NON-UTILITY HELD-WEAPON DISAMBIGUATION
The held weapon in the narrator's first-person view EITHER belongs to the
utility class the chapter teaches (the deployable being demonstrated —
grenade, projectile, ability orb, deployable gadget, etc.) OR it does not.
If it does not, the narrator has not yet equipped the utility and the
frame is NOT an aim demo regardless of any other cue.

  - REJECT any frame whose first-person held weapon is a BLADE, KNIFE,
    MELEE weapon, SIDEARM, or PRIMARY firearm — the visual cue is a
    long edge, a held hilt, a barrel/sights, or an off-hand swing.
    Cosmetic skins (ornate, gold, gemmed, animated, "inspector"-grade
    finishes in either CS2 or Valorant) do NOT convert a melee or
    firearm model into a utility model — judge by the SHAPE and HELD
    POSE of the model, not by its color or texture.
  - The utility itself can be many shapes across games: short cylinders,
    round-ended canisters, glass bottles with visible liquid, ability
    orbs, sky-call beacons, deployable gadgets, projectile-launcher
    barrels held one-handed in ready pose. The unifying cue is that
    the held object is the chapter's UTILITY class, held in ready pose,
    not stowed and not airborne. Use the game/HUD cues above to
    identify which utility class is expected; if the held object is
    clearly NOT in that class (e.g., a blade), reject.
  - When uncertain whether the held object is the chapter's utility,
    fall back to the other positive aim cues — a locked crosshair on
    a far landmark with a stable composition is itself a strong aim
    signal even when the held-weapon class is ambiguous.

  Concrete examples (NON-EXHAUSTIVE — recognize the visual PATTERN, not
  the exact name; new skins and games are released constantly):
    - CS2 non-utility models: knives like karambit, M9 bayonet, butterfly,
      bowie, huntsman, flip, navaja, ursus, talon, classic — including
      ornate gold / marble fade / case-hardened / doppler / fade /
      lore "inspector"-grade animated finishes. Also: any held primary
      (AK, M4, AWP, etc.) or sidearm (Glock, USP, Deagle, etc.).
    - Valorant non-utility models: knife / melee slot weapons including
      Reaver, Sovereign, Prime, Singularity, Champions, Glitchpop, RGX,
      and similar premium / battle-pass knife skins.
    - Generic across games: any first-person model that is clearly a
      held BLADE shape, a rifle / pistol with a visible barrel and
      sights, or a sword / club / hammer. None are utilities.

  If the visible held weapon visually matches the "non-utility" pattern
  in ANY game, REJECT the frame regardless of utility text in HUD overlays
  or chapter-naming graphics.

CHAPTER-INTRO PHASE EXCLUSION
Many lineup videos open each chapter with a WALK-IN PHASE during which
the narrator is approaching the throwing spot, often with chapter-naming
graphics on screen — text overlays, lower-thirds, animated labels,
title cards, callout boxes, or full-screen titles that NAME the lineup
(site, landmark, utility number, etc.). Format and position vary widely
by creator. The aim demo is structurally AFTER this walk-in phase, once
the narrator has arrived at the spot and equipped the utility.

  - When a chapter-naming graphic is rendered in-frame at full opacity,
    treat the frame as walk-in and prefer a LATER frame in which the
    overlay has faded, shrunk, transitioned out, or been replaced.
    This holds even if the narrator's view is already settled in that
    frame — the overlay's full-opacity presence marks the walk-in
    phase regardless of camera motion.
  - Chapter-naming overlay text is NOT a HUD aim callout. The overlay
    RESTATES the chapter title (the lineup's destination / utility
    number / site label); it is metadata about which lineup is being
    introduced, not a "AIM HERE" annotation pointing at a target
    pixel. Do NOT count its presence as a positive aim cue, and do
    NOT pick a frame just because the overlay text matches the
    chapter's subject — the overlay text matches by construction.
    True aim HUD callouts are anchored to a specific landmark in
    the world (an arrow/circle/marker drawn over a pixel of the
    scene); chapter-naming graphics float in screen space and name
    the chapter, not the aim target.
  - NOT ALL videos use chapter-naming graphics. ABSENCE of an overlay
    is NEUTRAL — do not penalize a frame for lacking one and do not
    treat overlay presence as required. Some creators use no overlays
    at all; the aim-demo signal is the locked-crosshair-on-landmark
    composition, not the overlay.

  Concrete examples of chapter-intro graphics (NON-EXHAUSTIVE — recognize
  the PATTERN, not the literal strings; format VARIES BY CREATOR):
    - Large overlay text naming the lineup at chapter start, e.g.
      ``SMOKE #N``, ``B SITE - MARKET WINDOW``, ``MARKET WINDOW - B SITE``,
      ``LINEUP 12 / A SHORT``, ``SMOKE / TOP MID``, or ``UTILITY NAME /
      TARGET LANDMARK``.
    - Numbered cards, animated lower-thirds, title-card transitions,
      full-screen titles, fade-in callout boxes.
    - Persistent lower-third callouts that fade after the walk-in
      completes.
    - Creator branding overlays bundled with the chapter title.

  Format VARIES BY CREATOR — these are the patterns, not the literal
  strings. ABSENCE of an overlay is NOT a signal (treat all frames
  equally; rely on other cues). Overlay TEXT names the lineup as
  METADATA — it is NOT an in-game HUD aim callout, and seeing the
  overlay text on a frame does NOT make that frame an aim demo.

CANDIDATE-FRAME EXCLUSIONS
Do NOT return aim_index on a frame matching ANY of:
  - MID-WINDUP / MID-THROW: utility-arm pulled back, throw animation
    started, character body rotating into throw, projectile airborne.
    The whole point of this classifier is to find the frame BEFORE this.
  - STAND-LOCATION-CENTERED: composition emphasises the spot's
    surroundings (wall behind, cover, floor markings) — that is the
    STAND demo, not AIM. Subject is the location, not the target.
  - MAP OVERLAY / MINIMAP ZOOM: those are STAND demos, not AIM.
  - KNIFE-IN-HAND / NON-UTILITY-IN-HAND / UTILITY-HOLSTERED: any
    visible blade, melee weapon, sidearm, or primary firearm → not
    yet aiming. The narrator may be walking up; wait for frames where
    the chapter's utility class is in hand. (See CRITICAL — NON-UTILITY
    HELD-WEAPON DISAMBIGUATION above; ornate cosmetic skins do not
    convert a non-utility model into a utility model.)
  - WALKING / CAMERA SWEEPING: view is in motion AND crosshair is
    not held on a single landmark. A still camera tilted up at a
    sky/tower landmark is NOT "camera sweeping" — it is the aim
    demo. Reject only on actual motion across multiple frames.
  - REPLAY / KILL-CAM / SCOREBOARD / MENU.
  - PURE TALKING-HEAD / FACECAM-DOMINANT frame with the aim view not
    visible or not the primary subject.

NOT exclusions (allowed for AIM, unlike the stand-timing classifier):
  - Crosshair on a FAR LANDMARK — STRONGEST aim cue. Frame's subject is
    "what to aim at"; pick it when the composition emphasises the target.
  - First-person hands-visible composition — expected when utility is
    held up in ready pose.
  - Tight target-centric framings — wide framings are STAND, tight is AIM.

STRUCTURAL ANCHOR — LAST SETTLED BEAT BEFORE THE THROW MOTION (operator spec 2026-05-31)
AIM is the LAST SETTLED FRAME before the throw motion begins — the
instant the thrower is lined up and about to commit. Concretely: the
utility (smoke/grenade/ability) is IN HAND, the crosshair is PARKED on
the target landmark, and the view is STILL — and it is the LATEST such
frame BEFORE the player starts the throw motion (a windup, OR a jump,
OR a strafe — see below).

The ~1 second clip is cut END-ANCHORED on the picked frame downstream
(it runs [pick − 1.0s, pick]), so it shows the second of settling onto
the landmark and ENDS on the lined-up aim. Picking the LATEST settled
frame is therefore correct and safe: the clip never extends into the
windup, release, flight, or landing — those are all AFTER the pick.

Prefer the frame where:
  - The crosshair is stationary on the target landmark (zero crosshair
    velocity) and the utility is in hand.
  - It is the LATEST such frame before the throw motion starts — i.e.
    the immediately following frames begin the windup / jump / strafe.
    Among several settled frames, pick the LAST one before that
    movement, NOT a middle or early one.
  - At LEAST one prior frame ALSO shows the crosshair on the same
    landmark (the lock is established, not a transient sweep).

JUMP-THROWS AND STRAFE-THROWS (critical — the aim is DECOUPLED from release)
Many lineups require a jump-throw, or strafing forward / sideways while
throwing. There the thrower LINES UP THE AIM FIRST (crosshair parked on
the landmark, still), THEN jumps or strafes WHILE throwing — so the
utility leaves the hand LATER and from a MOVED position with a
different look-direction. The AIM frame is the settled lined-up beat
BEFORE that movement, which may be a fraction of a second or SEVERAL
seconds before the actual release. Do NOT pick a frame where the player
has already left the ground, begun strafing, or rotated into the throw
— those are throw-motion frames, not the aim. Pick the last STILL beat
before the motion.

If no clearly-settled frame exists before the motion (every frame is
sweeping or already moving), accept the cleanest near-settled frame —
partial information beats skipping the demo.

WHEN MULTIPLE DEMONSTRATIONS EXIST
The narrator may show the aim more than once (initial glance → small
adjustment → final lock-and-throw). Pick the settled beat from the
demonstration that is ACTUALLY THROWN — the last lined-up frame right
before the throw motion that leads into the release. When in doubt,
prefer the LATER lined-up beat (closer to the throw), not an early
glance the narrator adjusted away from.

WHEN NO DEMONSTRATION EXISTS
Some chapters skip the aim-demo entirely (narrator stands and immediately
throws). Set has_aim_demonstration=false, aim_index=null, confidence HIGH
(this is a confident negative, not an unsure pick). The downstream
consumer will skip the AIM clip and show the aim still in its place; do
NOT force-pick a near-demo frame.

CONFIDENCE
0-1 that you correctly identified a real aim demonstration. High when the
chosen frame's SUBJECT is unambiguously the AIM TARGET and the utility is
in ready pose. Low when the frame might also be read as stand, transition,
or partial windup.

REASONING (<= 80 words)
State the aim cue you keyed on (crosshair-on-landmark, HUD callout,
utility-in-ready, tight target composition), which frame number, AND —
if you skipped candidates due to exclusions — which frame numbers and
which exclusion (e.g., "skipped F5 stand-wide-framing, F7 mid-windup;
picked F6 crosshair locked on antenna with smoke in hand").
"""
