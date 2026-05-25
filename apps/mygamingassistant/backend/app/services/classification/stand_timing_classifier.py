"""Claude STAND-localization classifier — frame-level "where to stand" pick.

SEPARATE Claude code path from :func:`classify_throw_timing_from_frames`
(release/result localization) and from
``classify_frames_for_lineup_decision`` (grid game/map/zone classifier).
This module's ONLY job is: given N frames sampled from the PRE-RELEASE
portion of one chapter, return the 1-based index of the frame that BEST
demonstrates *where the thrower should stand* to execute this lineup.

Why a separate prompt:

  * The throw-timing prompt's CANDIDATE-FRAME EXCLUSIONS hard-rule out
    map-overview / title-card / knife-walking frames — those are great
    STAND candidates. Reusing throw_timing for STAND would force the
    model to pick a sub-optimal "settled at spot" frame when a map
    overlay frame is the real subject ("here's the spot").
  * STAND is a SEMANTIC pick ("frame whose subject is the LOCATION"),
    not a motion pick ("frame where the player is stationary"). The
    narrator may be walking to the spot, showing it from afar, panning
    over a callout — any of these are valid stand-demonstrations and
    none of them require the player to be stopped.

Per rules/no-bandaid-solutions.md: replacing the
``release_ts − _STAND_PRE_RELEASE_SECONDS`` fixed-offset heuristic
(which the operator confirmed cannot generalize across tutorial styles)
with a content-aware Claude pick is the no-bandaid fix — the heuristic
constant just bounced from 3.0s to 7.0s and still didn't work.

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
from app.services.classification.classification_result import StandTimingResult
from app.services.classification.classifier_service import (
    _GAME_VISUAL_CUES,
    _strip_json_fences,
    _validate_grid_index,
)

logger = logging.getLogger(__name__)


_STAND_TIMING_SCHEMA_DOC = """\
You are given {n} numbered frames (Frame 1 .. Frame {n}) sampled in time
order from the PRE-RELEASE portion of ONE chapter of a tactical-FPS lineup
tutorial. The chapter teaches ONE utility throw; the narrator typically
SHOWS where to stand, SHOWS where to aim, then THROWS (the throw itself
is past these frames).

Your ONLY job is to locate the STAND demonstration — the frame that best
shows WHERE the thrower should stand to execute this lineup.

Return ONLY bare JSON — no markdown fences, no preamble — with exactly:
{{
  "has_stand_demonstration": boolean,
  "stand_index": integer (1-{n}) or null,
  "confidence": number (0.0-1.0),
  "reasoning": string (<= 80 words)
}}

WHAT COUNTS AS A STAND DEMONSTRATION
A stand-demo frame's SUBJECT is the LOCATION — not the aim target, not
the throw, not the player's hands. The narrator may be:
  - Standing at the spot, panning to show context.
  - Walking TO the spot — path-demo IS stand-demo, destination is subject.
  - Showing the spot from elsewhere (from afar, on map, third-person-ish).
All valid.

POSITIVE STAND CUES
  - Composition emphasizes the spot's surroundings (wall behind, cover
    object, floor markings, nearby landmarks).
  - Crosshair on environment / floor / nothing-in-particular — NOT on a
    far landmark used as an aim reference.
  - Map overlay or minimap zoom pinning the position.
  - HUD callouts naming/pointing at the spot ("STAND HERE", arrow,
    circled area, chapter banner that names the position).
  - Wide framings of the throwing area.

CANDIDATE-FRAME EXCLUSIONS
Do NOT return stand_index on a frame matching ANY of:
  - AIM-TARGET-CENTERED: the crosshair is on a FAR landmark (window
    pixel, antenna, ledge, skybox feature) and the composition is "what
    to aim at" — that is the AIM demo, not STAND. The frame's subject
    is the target, not the location.
  - MID-WINDUP / MID-THROW: utility being pulled out, throw animation
    started, or projectile airborne.
  - CHAPTER-INTRO / WALK-IN with a large opaque chapter-naming overlay
    on screen — that is the walk-in phase, not yet the settled stand
    demo. See CHAPTER-INTRO PHASE EXCLUSION below.
  - REPLAY / KILL-CAM / SCOREBOARD / MENU.
  - PURE TALKING-HEAD / FACECAM-DOMINANT frame with the spot not visible.

NON-UTILITY HELD-WEAPON DISAMBIGUATION
Many lineup videos open with the narrator running TO the spot with a
knife, melee weapon, sidearm, or primary firearm in hand — these are
walk-in frames, NOT settled stand demos. A true stand demo typically has
the narrator stationary at the throwing spot with the chapter's utility
equipped (or already preparing to equip it).

  - REJECT any frame whose first-person held weapon is a BLADE, KNIFE,
    MELEE weapon, SIDEARM, or PRIMARY firearm AND the narrator is in
    motion (running, sliding, jumping). Judge by the SHAPE and HELD
    POSE — cosmetic skins (gold, ornate, animated "inspector"-grade
    finishes in either CS2 or Valorant) do NOT convert a non-utility
    model into a utility model.
  - EXCEPTION: a stationary frame at the spot with a knife / non-utility
    still equipped is allowed when the composition unambiguously
    emphasizes the LOCATION (wide framing of cover, floor markings,
    chapter banner naming the position). The disqualifier is motion,
    not the held-weapon class.

  Concrete examples (NON-EXHAUSTIVE — recognize the visual PATTERN, not
  the exact name):
    - CS2 non-utility models: knives like karambit, M9 bayonet, butterfly,
      bowie, huntsman, flip, navaja, ursus — including ornate gold /
      marble fade / case-hardened / doppler inspector skins. Also: any
      held primary (AK, M4, AWP) or sidearm (Glock, USP, Deagle).
    - Valorant non-utility models: knife / melee slot weapons including
      Reaver, Sovereign, Prime, Champions, Glitchpop, RGX, and similar
      premium / battle-pass knife skins.

CHAPTER-INTRO PHASE EXCLUSION
Many lineup videos open each chapter with chapter-naming graphics —
text overlays, lower-thirds, animated labels, title cards, callout
boxes. The stand demo is structurally AFTER this intro phase, once the
narrator has arrived at the spot.

  - When a chapter-naming graphic is rendered in-frame at full opacity,
    treat the frame as walk-in and prefer a LATER frame in which the
    overlay has faded, shrunk, transitioned out, or been replaced.
  - Chapter-naming overlay text is NOT a STAND callout. The overlay
    RESTATES the chapter title (lineup destination / utility number /
    site label) as METADATA. Do NOT pick a frame just because the
    overlay text matches the chapter's subject — overlay text matches
    by construction. True STAND HUD callouts are anchored to a specific
    location in the world (an arrow / circle / marker drawn over the
    spot); chapter-naming graphics float in screen space.
  - NOT ALL videos use chapter-naming graphics. ABSENCE of an overlay
    is NEUTRAL — do not penalize a frame for lacking one. Format
    VARIES BY CREATOR.

  Concrete examples of chapter-intro graphics (NON-EXHAUSTIVE):
    - Large overlay text naming the lineup, e.g. ``SMOKE #N``,
      ``B SITE - MARKET WINDOW``, ``MARKET WINDOW - B SITE``,
      ``LINEUP 12 / A SHORT``.
    - Numbered cards, animated lower-thirds, title-card transitions.
    - Persistent lower-third callouts that fade after walk-in.

NOT exclusions (allowed for STAND, unlike the throw-timing classifier):
  - Map-overview / minimap-zoom frames — STRONG candidates when they pin
    the position. Pick them when they are the clearest "this is the
    spot" frame in the set.
  - Stationary knife-in-hand / utility-holstered frames AT THE SPOT —
    STAND doesn't require utility-in-hand once the narrator is stopped.
    See NON-UTILITY HELD-WEAPON DISAMBIGUATION above for the motion
    qualifier.

STRUCTURAL ANCHOR — MIDDLE OF SETTLED-STANCE (operator audit 2026-05-25)
STAND is a frame from the MIDDLE of the settled-stance phase — NOT the
edges of it. A ~1 second clip is cut centred on the picked frame
downstream, and an edge-of-phase pick lets that clip extend into the
preceding walk-up OR the following look-up-to-aim transition. Both
distort what the viewer is supposed to learn: the FIXED starting
position before any movement.

Prefer a frame where:
  - The narrator is stationary at the throwing spot AND has been
    stationary for AT LEAST one prior frame in the candidate set.
  - The next frame in the candidate set is ALSO stationary at the same
    spot — the camera has not yet started tilting up to aim.
  - The camera is held still (not panning or sweeping mid-arrival).
  - The chapter-intro overlay, if any, has faded out, transitioned, or
    no longer dominates the frame.

REJECT these edge-of-phase picks:
  - FIRST settled frame right after walk-up arrival (the prior frame
    shows motion). A clip centred here catches the walk-up on the
    pre-side, blurring "where to stand" with "how to get there".
  - LAST settled frame before the camera tilts up to aim (the next
    frame shows camera motion). A clip centred here catches the
    look-up on the post-side, blurring stand with aim.

If the candidate set only contains edges (no stationary frames on
BOTH sides of any pick), accept the cleanest available — partial
information is still better than skipping the demo.

WHEN MULTIPLE DEMONSTRATIONS EXIST
The narrator may show the spot more than once (afar → walking up →
settled at spot → small re-adjustment). Per the STRUCTURAL ANCHOR
above, prefer a MIDDLE-of-phase frame from the LONGEST contiguous
settled-stance segment. Length of stationary stance dominates: a 4-
frame settled segment with a clean middle frame is preferable to a
2-frame settled segment, even if the 2-frame segment came first.

WHEN NO DEMONSTRATION EXISTS
Some chapters skip the stand-demo entirely (narrator walks to spot, then
immediately aims). Set has_stand_demonstration=false, stand_index=null,
confidence HIGH (this is a confident negative, not an unsure pick). The
downstream consumer will skip the STAND clip and show the stand still in
its place; do NOT force-pick a near-demo frame.

CONFIDENCE
0-1 that you correctly identified a real stand demonstration. High when
the chosen frame's SUBJECT is unambiguously the LOCATION. Low when the
frame might also be read as aim, transition, or arrival.

REASONING (<= 80 words)
State the stand cue you keyed on (composition emphasis, map overlay,
callout, banner), which frame number, AND — if you skipped candidates
due to exclusions — which frame numbers and which exclusion (e.g.,
"skipped F5 aim-target-centered on antenna, F7 mid-windup; picked F3
wide framing of cover wall").
"""


async def classify_stand_timing_from_frames(
    *,
    frames: list[bytes],
    frame_timestamps: list[float],
    chapter_title: Optional[str],
    chapter_duration: Optional[float],
    utility_hint: Optional[str] = None,
) -> StandTimingResult:
    """Locate the STAND demonstration frame within ONE chapter.

    Separate Claude code path from throw-timing classification (own
    prompt, own schema, no slug resolution, no DB).  The caller turns
    ``stand_index`` back into a timestamp via the SAME ``frame_timestamps``
    list the frames were extracted from.

    Args:
        frames: Downscaled candidate PNG bytes, in time order (the
            pre-release coarse or dense window — see
            :mod:`ingestion.stand_localizer`).
        frame_timestamps: Timestamp (seconds) of each frame; same order
            and length as *frames*. Surfaced to the model as
            ``Frame i (t=..s):`` AND used by the caller to map the
            returned 1-based index back to seconds.
        chapter_title: YouTube chapter title — per-call context.
        chapter_duration: Chapter length in seconds — per-call context.
        utility_hint: Optional utility slug from a prior grid
            classification (passed only when confidence > 0.6) — helps
            the model reason about what kind of stand position to look
            for (e.g., a smoke usually has a wider stand demo than a
            flash because smoke positions are landmark-relative).

    Returns:
        StandTimingResult. ``success=True`` with
        ``has_stand_demonstration=False`` is a successful "no demo in
        this chapter" answer, not an error. ``error_codes`` is populated
        only on an API/parse failure or a structured per-call gate
        violation.
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "stand_timing: ANTHROPIC_API_KEY not configured — skipping "
            "(chapter=%r)", chapter_title,
        )
        return StandTimingResult(
            success=False,
            error_codes=["missing_api_key"],
            reasoning="ANTHROPIC_API_KEY not configured",
        )

    if not frames:
        return StandTimingResult(
            success=False,
            error_codes=["no_frames"],
            reasoning="No candidate frames supplied to stand-timing classifier",
        )

    if len(frames) != len(frame_timestamps):
        # A frame/timestamp length mismatch would silently misalign the
        # returned index → wrong STAND anchor. Fail loud (no silent-fail).
        return StandTimingResult(
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
        "shown several timestamped frames from the PRE-RELEASE portion of "
        "one chapter of a lineup tutorial and must pick the frame that "
        "best demonstrates WHERE the thrower should stand.\n\n"
        + _GAME_VISUAL_CUES
        + "\n"
        + _STAND_TIMING_SCHEMA_DOC.format(n=n)
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
    if utility_hint:
        context_parts.append(
            f"Utility type (from prior classification): {utility_hint}"
        )
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
            "stand_timing: rate limit hit: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return StandTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API rate limit: {exc}",
        )
    except anthropic.APIStatusError as exc:
        error_type = getattr(exc, "type", None) or f"api_status_{exc.status_code}"
        logger.error(
            "stand_timing: API status error: chapter=%r error_type=%s "
            "status_code=%s message=%s",
            chapter_title, error_type, exc.status_code, str(exc),
        )
        return StandTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error ({exc.status_code}): {exc}",
        )
    except anthropic.APIError as exc:
        error_type = getattr(exc, "type", "api_error") or "api_error"
        logger.error(
            "stand_timing: API error: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return StandTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error: {exc}",
        )

    raw_text = response.content[0].text if response.content else ""
    try:
        parsed: dict[str, Any] = json.loads(_strip_json_fences(raw_text))
    except (json.JSONDecodeError, IndexError) as exc:
        logger.error(
            "stand_timing: JSON parse failed: chapter=%r raw=%r error=%s",
            chapter_title, raw_text[:200], str(exc),
        )
        return StandTimingResult(
            success=False,
            error_codes=["json_parse_error"],
            reasoning=f"Could not parse stand-timing JSON: {exc}",
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
                "stand_timing: invalid confidence value dropped: "
                "chapter=%r raw_confidence=%r",
                chapter_title, raw_conf,
            )
            failures.append(
                f"invalid confidence value '{raw_conf}' — not a number; "
                f"treated as null"
            )
            structured_codes.append(f"invalid_confidence:{raw_conf}")

    model_reasoning = str(parsed.get("reasoning") or "")
    has_demo = bool(parsed.get("has_stand_demonstration"))

    if not has_demo:
        logger.info(
            "stand_timing: has_stand_demonstration=False chapter=%r n=%d "
            "confidence=%.2f",
            chapter_title, n, confidence or 0.0,
        )
        return StandTimingResult(
            success=True,
            has_stand_demonstration=False,
            stand_index=None,
            confidence=confidence,
            reasoning=model_reasoning
            or "Classifier judged no stand-demonstration in these frames.",
            error_codes=list(structured_codes),
        )

    stand_index = _validate_grid_index(
        parsed.get("stand_index"), "stand_index", n, failures
    )

    if failures:
        reasoning = f"{model_reasoning}\nNotes: {'; '.join(failures)}".strip()
    else:
        reasoning = model_reasoning

    logger.info(
        "stand_timing: has_stand_demonstration=True chapter=%r n=%d "
        "stand_idx=%s confidence=%.2f",
        chapter_title, n, stand_index, confidence or 0.0,
    )

    return StandTimingResult(
        success=True,
        has_stand_demonstration=True,
        stand_index=stand_index,
        confidence=confidence,
        reasoning=reasoning,
        error_codes=list(structured_codes),
    )
