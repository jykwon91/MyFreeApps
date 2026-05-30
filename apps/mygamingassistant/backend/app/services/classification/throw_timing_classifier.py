"""Claude throw-timing classifier — frame-level release/result localization.

A SEPARATE Claude code path from classify_frames_for_lineup_decision (the
grid game/map/zone/side/utility classifier). This module does NOT classify
game/map/zone/side/utility and does NOT resolve slugs or touch the DB — its
only job is to find, within ONE chapter, the frame the utility is RELEASED
and the frame its RESULT first shows, so the caller can cut a tight
gif-style clip around the throw.

Conflating it with the grid classifier would couple two prompts that must
evolve independently (frozen design contract pr2-clip-localization-design.md).

Shared helpers live in their own sibling modules:
  - ``prompts``: ``GAME_VISUAL_CUES``
  - ``response_parsing``: ``strip_json_fences``, ``validate_grid_index``
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

import anthropic

from app.core.config import settings
from app.services.classification.classification_result import ThrowTimingResult
from app.services.classification.prompts import GAME_VISUAL_CUES
from app.services.classification.response_parsing import (
    strip_json_fences,
    validate_grid_index,
)
from app.services.classification.throw_timing_prompt import (
    THROW_TIMING_SCHEMA_DOC,
)

logger = logging.getLogger(__name__)


async def classify_throw_timing_from_frames(
    *,
    frames: list[bytes],
    frame_timestamps: list[float],
    chapter_title: Optional[str],
    chapter_duration: Optional[float],
    utility_hint: Optional[str] = None,
) -> ThrowTimingResult:
    """Locate the release/result frames of a throw within ONE chapter.

    Separate Claude code path from :func:`classify_frames_for_lineup_decision`
    (own prompt, own schema, no reference data, no slug resolution, no DB).
    The caller turns ``release_index`` / ``result_index`` back into timestamps
    via the SAME ``frame_timestamps`` list the frames were extracted from.

    Args:
        frames: Downscaled candidate PNG bytes, in time order (the dense
            throw window — see ``frame_extractor.clip_window_timestamps``).
        frame_timestamps: The timestamp (seconds) of each frame, same order
            and length as *frames*. Surfaced to the model as load-bearing
            context (``Frame i (t=..s):``) AND used by the caller to map the
            returned 1-based indices back to seconds.
        chapter_title: YouTube chapter title (per-call context).
        chapter_duration: Chapter length in seconds (per-call context).
        utility_hint: Optional utility slug from the prior grid classification
            (only passed when that ran at confidence > 0.6) — helps the model
            pick the right RESULT cue.

    Returns:
        ThrowTimingResult. ``success=True`` with ``is_lineup_throw`` possibly
        False is a successful "this is not a throw" answer, not an error.
        ``error_codes`` is populated only on an API/parse failure.
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "throw_timing: ANTHROPIC_API_KEY not configured — skipping "
            "(chapter=%r)", chapter_title,
        )
        return ThrowTimingResult(
            success=False,
            error_codes=["missing_api_key"],
            reasoning="ANTHROPIC_API_KEY not configured",
        )

    if not frames:
        return ThrowTimingResult(
            success=False,
            error_codes=["no_frames"],
            reasoning="No candidate frames supplied to throw-timing classifier",
        )

    if len(frames) != len(frame_timestamps):
        # A frame/timestamp length mismatch would silently misalign every
        # returned index → wrong clip bounds. Fail loud (no silent-fail).
        return ThrowTimingResult(
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
        "shown several timestamped frames from one chapter of a lineup "
        "tutorial and must pinpoint exactly when the utility is released and "
        "when its effect first lands.\n\n"
        + GAME_VISUAL_CUES
        + "\n"
        + THROW_TIMING_SCHEMA_DOC.format(n=n)
    )

    # Per-call content: each frame labelled with its 1-based index AND its
    # timestamp (the timestamp is load-bearing — it is how the caller maps the
    # answer back to seconds), then the per-chapter context block. Frames are
    # the variable part (NOT cached); the system prompt is cache_control'd.
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
            "throw_timing: rate limit hit: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return ThrowTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API rate limit: {exc}",
        )
    except anthropic.APIStatusError as exc:
        error_type = getattr(exc, "type", None) or f"api_status_{exc.status_code}"
        logger.error(
            "throw_timing: API status error: chapter=%r error_type=%s "
            "status_code=%s message=%s",
            chapter_title, error_type, exc.status_code, str(exc),
        )
        return ThrowTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error ({exc.status_code}): {exc}",
        )
    except anthropic.APIError as exc:
        error_type = getattr(exc, "type", "api_error") or "api_error"
        logger.error(
            "throw_timing: API error: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return ThrowTimingResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error: {exc}",
        )

    raw_text = response.content[0].text if response.content else ""
    try:
        parsed: dict[str, Any] = json.loads(strip_json_fences(raw_text))
    except (json.JSONDecodeError, IndexError) as exc:
        logger.error(
            "throw_timing: JSON parse failed: chapter=%r raw=%r error=%s",
            chapter_title, raw_text[:200], str(exc),
        )
        return ThrowTimingResult(
            success=False,
            error_codes=["json_parse_error"],
            reasoning=f"Could not parse throw-timing JSON: {exc}",
        )

    failures: list[str] = []
    structured_codes: list[str] = []

    confidence: Optional[float] = None
    raw_conf = parsed.get("confidence")
    if raw_conf is not None:
        try:
            confidence = max(0.0, min(1.0, float(raw_conf)))
        except (TypeError, ValueError):
            # A malformed score is a diagnosable signal — structured log +
            # structured code (mirrors classify_lineup /
            # classify_frames_for_lineup_decision), never a silent drop
            # (rules/check-third-party-error-codes.md).
            logger.warning(
                "throw_timing: invalid confidence value dropped: "
                "chapter=%r raw_confidence=%r",
                chapter_title, raw_conf,
            )
            failures.append(
                f"invalid confidence value '{raw_conf}' — not a number; "
                f"treated as null"
            )
            structured_codes.append(f"invalid_confidence:{raw_conf}")

    model_reasoning = str(parsed.get("reasoning") or "")
    is_lineup_throw = bool(parsed.get("is_lineup_throw"))

    # Not a throw → indices are meaningless; return the verdict early so the
    # caller skips clip generation and keeps the stills.
    if not is_lineup_throw:
        logger.info(
            "throw_timing: is_lineup_throw=False chapter=%r n=%d confidence=%.2f",
            chapter_title, n, confidence or 0.0,
        )
        return ThrowTimingResult(
            success=True,
            is_lineup_throw=False,
            release_index=None,
            result_index=None,
            confidence=confidence,
            reasoning=model_reasoning
            or "Classifier judged these frames are not a utility throw.",
            error_codes=list(structured_codes),
        )

    release_index = validate_grid_index(
        parsed.get("release_index"), "release_index", n, failures
    )
    result_index = validate_grid_index(
        parsed.get("result_index"), "result_index", n, failures
    )
    earlier_demonstration_result_index = validate_grid_index(
        parsed.get("earlier_demonstration_result_index"),
        "earlier_demonstration_result_index", n, failures,
    )
    # Only a genuine multi-demonstration signal when it points EARLIER than the
    # release the model picked: it means "an earlier demonstration's result
    # precedes your release", i.e. the release likely landed on a later repeat.
    # A value >= release_index (or with release_index missing) is not an
    # earlier-demo signal — drop it so the localizer never re-centres spuriously.
    if earlier_demonstration_result_index is not None and (
        release_index is None
        or earlier_demonstration_result_index >= release_index
    ):
        earlier_demonstration_result_index = None

    # Frozen-contract parser enforcement: a result cannot precede its own
    # release. If the model returned both but inverted, force result to the
    # release frame and log (do NOT silently swap — the operator/dash should
    # be able to see this happened).
    causality_inverted_earlier_index: Optional[int] = None
    if (
        release_index is not None
        and result_index is not None
        and result_index < release_index
    ):
        # A result cannot precede its own release — a real model-quality
        # signal. WARNING (not INFO) so it survives production log levels and
        # the operator can track how often the model inverts the throw.
        logger.warning(
            "throw_timing: result_index (%d) < release_index (%d) — forcing "
            "result_index = release_index: chapter=%r",
            result_index, release_index, chapter_title,
        )
        # Preserve the ORIGINAL earlier index before forcing. An inversion is
        # the multi-demonstration signature (the model paired a LATE demo's
        # release with an EARLY demo's result); the localizer uses this to
        # re-localise densely around the first event. The frozen contract
        # (result_index >= release_index in the returned value) is unchanged.
        causality_inverted_earlier_index = result_index
        result_index = release_index

    if failures:
        reasoning = f"{model_reasoning}\nNotes: {'; '.join(failures)}".strip()
    else:
        reasoning = model_reasoning

    logger.info(
        "throw_timing: is_lineup_throw=True chapter=%r n=%d release_idx=%s "
        "result_idx=%s earlier_demo_idx=%s confidence=%.2f",
        chapter_title, n, release_index, result_index,
        earlier_demonstration_result_index, confidence or 0.0,
    )

    return ThrowTimingResult(
        success=True,
        is_lineup_throw=True,
        release_index=release_index,
        result_index=result_index,
        causality_inverted_earlier_index=causality_inverted_earlier_index,
        earlier_demonstration_result_index=earlier_demonstration_result_index,
        confidence=confidence,
        reasoning=reasoning,
        error_codes=list(structured_codes),
    )
