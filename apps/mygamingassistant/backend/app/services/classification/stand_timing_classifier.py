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
  - REPLAY / KILL-CAM / SCOREBOARD / MENU.
  - PURE TALKING-HEAD / FACECAM-DOMINANT frame with the spot not visible.

NOT exclusions (allowed for STAND, unlike the throw-timing classifier):
  - Map-overview / minimap-zoom frames — STRONG candidates when they pin
    the position. Pick them when they are the clearest "this is the
    spot" frame in the set.
  - Title-card / chapter-banner frames IF the banner names the position
    ("MARKET WINDOW — B SITE") AND the underlying view shows the spot.
  - Knife-only / utility-holstered frames — STAND doesn't require
    utility-in-hand.

WHEN MULTIPLE DEMONSTRATIONS EXIST
The narrator may show the spot more than once (afar → walking up → at
spot). Prefer the LATEST stand-demo frame that PRECEDES any aim-windup
activity — the latest demo is freshest in the viewer's memory and is
closest to where the viewer will actually be standing. If the latest is
partial (player already starting to look up to aim) and an earlier
framing is cleaner, prefer the LATEST CLEAN one — quality outranks
recency within the pre-aim-windup set.

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
