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
from app.services.classification.classifier_service import (
    _GAME_VISUAL_CUES,
    _strip_json_fences,
    _validate_grid_index,
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
  - Utility VISIBLE IN HAND (grenade pulled out, smoke held, molotov
    primed) — pre-windup, not mid-throw.
  - HUD may overlay the target ("AIM HERE", crosshair circle, arrow on
    the landmark, ALIGN-PIXEL marker).
All valid.

POSITIVE AIM CUES
  - Crosshair locked on a far landmark used as an aim reference
    (window pixel, antenna, ledge, skybox feature).
  - Tight composition centred on the aim landmark — minimal camera
    motion, view stable over several frames.
  - Utility visible in hand, in READY pose (held up, not in windup arc).
  - HUD callouts naming/pointing at the aim target.
  - Pixel-alignment marks / on-screen reticle annotation.
  - Latest "settled" frame BEFORE any windup motion begins.

CANDIDATE-FRAME EXCLUSIONS
Do NOT return aim_index on a frame matching ANY of:
  - MID-WINDUP / MID-THROW: utility-arm pulled back, throw animation
    started, character body rotating into throw, projectile airborne.
    The whole point of this classifier is to find the frame BEFORE this.
  - STAND-LOCATION-CENTERED: composition emphasises the spot's
    surroundings (wall behind, cover, floor markings) — that is the
    STAND demo, not AIM. Subject is the location, not the target.
  - MAP OVERLAY / MINIMAP ZOOM: those are STAND demos, not AIM.
  - KNIFE-ONLY / UTILITY-HOLSTERED: no utility in hand → not yet aiming.
    The narrator may be walking up; wait for utility-out frames.
  - WALKING / CAMERA SWEEPING: view is in motion, crosshair not held
    on a single landmark.
  - REPLAY / KILL-CAM / SCOREBOARD / MENU.
  - PURE TALKING-HEAD / FACECAM-DOMINANT frame with the aim view not
    visible or not the primary subject.

NOT exclusions (allowed for AIM, unlike the stand-timing classifier):
  - Crosshair on a FAR LANDMARK — STRONGEST aim cue. Frame's subject is
    "what to aim at"; pick it when the composition emphasises the target.
  - First-person hands-visible composition — expected when utility is
    held up in ready pose.
  - Tight target-centric framings — wide framings are STAND, tight is AIM.

WHEN MULTIPLE DEMONSTRATIONS EXIST
The narrator may show the aim more than once (initial show → small
adjustment → final lock). Prefer the LATEST aim-demo frame that PRECEDES
any windup motion — the latest demo is freshest in the viewer's memory
and is closest to where the viewer will actually be aiming. If the latest
is partial (crosshair drifting, utility starting to pull back) and an
earlier framing is cleaner, prefer the LATEST CLEAN one — quality
outranks recency within the pre-windup set.

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
    utility_hint: Optional[str] = None,
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
        utility_hint: Optional utility slug from a prior grid
            classification (passed only when confidence > 0.6) — helps
            the model reason about what kind of aim posture to look for
            (e.g., a smoke usually has a long settled aim on a precise
            landmark whereas a flash may be a quicker target check).

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
        + _GAME_VISUAL_CUES
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
        parsed: dict[str, Any] = json.loads(_strip_json_fences(raw_text))
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

    aim_index = _validate_grid_index(
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
