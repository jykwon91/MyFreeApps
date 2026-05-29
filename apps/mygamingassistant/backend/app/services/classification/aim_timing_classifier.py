"""Claude AIM-localization classifier — frame-level "what to aim at" pick.

SEPARATE Claude code path from :func:`classify_throw_timing_from_frames`
(release/result localization), from :func:`classify_stand_timing_from_frames`
(where-to-stand demo), and from ``classify_frames_for_lineup_decision``
(grid game/map/zone classifier). This module's ONLY job is: given N frames
sampled from the PRE-WINDUP portion of one chapter, return the 1-based
index of the frame that BEST demonstrates the LOCKED AIM the thrower
should reproduce.

Why a separate prompt:

  * The throw-timing prompt is about WHEN the throw is released — wrong
    semantic target for "what does the aim look like before the throw
    starts". Reusing it for AIM would force the model to pick frames near
    the release rather than the pre-windup locked-aim composition.
  * The stand-timing prompt explicitly EXCLUDES aim-target-centered
    frames as candidates (it wants the location, not the target). The
    AIM prompt INCLUDES them — they are the strongest aim cues.
  * AIM is a composition pick ("crosshair locked on a landmark, utility
    in hand, no windup motion yet"), not a motion pick. The narrator
    may be holding the aim steady for several seconds before throwing —
    any frame in that interval is a valid aim-demonstration.

Per rules/no-bandaid-solutions.md: replacing the
``release_ts − _AIM_PRE_RELEASE_SECONDS`` fixed-offset heuristic with a
content-aware Claude pick is the no-bandaid fix — the operator confirmed
the constant cannot generalise across utilities whose windup animations
vary in length (HE ~0.4s vs Molotov ~0.9s); bumping the constant to a
longer offset only delays the failure mode.

Per rules/check-third-party-error-codes.md: every failure surface
(rate limit, API error, JSON parse failure, invalid index/confidence)
returns a structured ``error_codes`` list — never bare ``None``.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

import anthropic

from app.core.config import settings
from app.services.classification.classification_result import AimTimingResult
from app.services.classification.prompts import GAME_VISUAL_CUES
from app.services.classification.response_parsing import (
    strip_json_fences,
    validate_grid_index,
)

logger = logging.getLogger(__name__)


_AIM_TIMING_SCHEMA_DOC = """\
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


async def classify_aim_timing_from_frames(
    *,
    frames: list[bytes],
    frame_timestamps: list[float],
    chapter_title: Optional[str],
    chapter_duration: Optional[float],
) -> AimTimingResult:
    """Locate the AIM demonstration frame within ONE chapter.

    Separate Claude code path from throw-timing and stand-timing
    classification (own prompt, own schema, no slug resolution, no DB).
    The caller turns ``aim_index`` back into a timestamp via the SAME
    ``frame_timestamps`` list the frames were extracted from.

    Args:
        frames: Downscaled candidate PNG bytes, in time order (the
            pre-windup coarse or dense window — see
            :mod:`ingestion.aim_localizer`).
        frame_timestamps: Timestamp (seconds) of each frame; same order
            and length as *frames*. Surfaced to the model as
            ``Frame i (t=..s):`` AND used by the caller to map the
            returned 1-based index back to seconds.
        chapter_title: YouTube chapter title — per-call context.
        chapter_duration: Chapter length in seconds — per-call context.

    Returns:
        AimTimingResult. ``success=True`` with
        ``has_aim_demonstration=False`` is a successful "no demo in
        this chapter" answer, not an error. ``error_codes`` is populated
        only on an API/parse failure or a structured per-call gate
        violation.
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "aim_timing: ANTHROPIC_API_KEY not configured — skipping "
            "(chapter=%r)", chapter_title,
        )
        return AimTimingResult(
            success=False,
            error_codes=["missing_api_key"],
            reasoning="ANTHROPIC_API_KEY not configured",
        )

    if not frames:
        return AimTimingResult(
            success=False,
            error_codes=["no_frames"],
            reasoning="No candidate frames supplied to aim-timing classifier",
        )

    if len(frames) != len(frame_timestamps):
        # A frame/timestamp length mismatch would silently misalign the
        # returned index → wrong AIM anchor. Fail loud (no silent-fail).
        return AimTimingResult(
            success=False,
            error_codes=["frame_timestamp_mismatch"],
            reasoning=(
                f"frames ({len(frames)}) and frame_timestamps "
                f"({len(frame_timestamps)}) length mismatch"
            ),
        )

    n = len(frames)

    system_prompt = (
        "You are a tactical-FPS utility-lineup video analyst. You will be "
        "shown several timestamped frames from the PRE-WINDUP portion of "
        "one chapter of a lineup tutorial and must pick the frame that "
        "best demonstrates the LOCKED AIM the thrower should reproduce.\n\n"
        + GAME_VISUAL_CUES
        + "\n"
        + _AIM_TIMING_SCHEMA_DOC.format(n=n)
    )

    user_content: list[dict] = []
    for i, (frame_bytes, ts) in enumerate(
        zip(frames, frame_timestamps), start=1
    ):
        user_content.append(
            {"type": "text", "text": f"Frame {i} (t={ts:.1f}s):"}
        )
        user_content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.standard_b64encode(frame_bytes).decode(),
                },
            }
        )

    context_parts: list[str] = []
    if chapter_title:
        context_parts.append(f"Chapter title: {chapter_title}")
    if chapter_duration is not None:
        context_parts.append(f"Chapter duration: {chapter_duration:.0f}s")
    if context_parts:
        user_content.append({"type": "text", "text": "\n".join(context_parts)})

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=settings.claude_classifier_model,
            max_tokens=600,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_content}],
        )
    except anthropic.RateLimitError as exc:
        error_type = getattr(exc, "type", "rate_limit_error") or "rate_limit_error"
        logger.warning(
            "aim_timing: rate limit hit: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return AimTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API rate limit: {exc}",
        )
    except anthropic.APIStatusError as exc:
        error_type = getattr(exc, "type", None) or f"api_status_{exc.status_code}"
        logger.error(
            "aim_timing: API status error: chapter=%r error_type=%s "
            "status_code=%s message=%s",
            chapter_title, error_type, exc.status_code, str(exc),
        )
        return AimTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error ({exc.status_code}): {exc}",
        )
    except anthropic.APIError as exc:
        error_type = getattr(exc, "type", "api_error") or "api_error"
        logger.error(
            "aim_timing: API error: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return AimTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error: {exc}",
        )

    raw_text = response.content[0].text if response.content else ""
    try:
        parsed: dict[str, Any] = json.loads(strip_json_fences(raw_text))
    except (json.JSONDecodeError, IndexError) as exc:
        logger.error(
            "aim_timing: JSON parse failed: chapter=%r raw=%r error=%s",
            chapter_title, raw_text[:200], str(exc),
        )
        return AimTimingResult(
            success=False,
            error_codes=["json_parse_error"],
            reasoning=f"Could not parse aim-timing JSON: {exc}",
        )

    failures: list[str] = []
    structured_codes: list[str] = []

    confidence: Optional[float] = None
    raw_conf = parsed.get("confidence")
    if raw_conf is not None:
        try:
            confidence = max(0.0, min(1.0, float(raw_conf)))
        except (TypeError, ValueError):
            logger.warning(
                "aim_timing: invalid confidence value dropped: "
                "chapter=%r raw_confidence=%r",
                chapter_title, raw_conf,
            )
            failures.append(
                f"invalid confidence value '{raw_conf}' — not a number; "
                f"treated as null"
            )
            structured_codes.append(f"invalid_confidence:{raw_conf}")

    model_reasoning = str(parsed.get("reasoning") or "")
    has_demo = bool(parsed.get("has_aim_demonstration"))

    if not has_demo:
        logger.info(
            "aim_timing: has_aim_demonstration=False chapter=%r n=%d "
            "confidence=%.2f",
            chapter_title, n, confidence or 0.0,
        )
        return AimTimingResult(
            success=True,
            has_aim_demonstration=False,
            aim_index=None,
            confidence=confidence,
            reasoning=model_reasoning
            or "Classifier judged no aim-demonstration in these frames.",
            error_codes=list(structured_codes),
        )

    aim_index = validate_grid_index(
        parsed.get("aim_index"), "aim_index", n, failures
    )

    if failures:
        reasoning = f"{model_reasoning}\nNotes: {'; '.join(failures)}".strip()
    else:
        reasoning = model_reasoning

    logger.info(
        "aim_timing: has_aim_demonstration=True chapter=%r n=%d "
        "aim_idx=%s confidence=%.2f",
        chapter_title, n, aim_index, confidence or 0.0,
    )

    return AimTimingResult(
        success=True,
        has_aim_demonstration=True,
        aim_index=aim_index,
        confidence=confidence,
        reasoning=reasoning,
        error_codes=list(structured_codes),
    )
