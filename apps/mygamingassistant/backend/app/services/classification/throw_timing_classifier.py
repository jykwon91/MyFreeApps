"""Claude throw-timing classifier — frame-level release/result localization.

A SEPARATE Claude code path from classify_frames_for_lineup_decision (the
grid game/map/zone/side/utility classifier). This module does NOT classify
game/map/zone/side/utility and does NOT resolve slugs or touch the DB — its
only job is to find, within ONE chapter, the frame the utility is RELEASED
and the frame its RESULT first shows, so the caller can cut a tight
gif-style clip around the throw.

Conflating it with the grid classifier would couple two prompts that must
evolve independently (frozen design contract pr2-clip-localization-design.md).

Extracted from classifier_service.py in PR #752 to keep that file under the
1000-LOC god-module threshold (TECH_DEBT.md). Shared helpers
(``_strip_json_fences``, ``_validate_grid_index``, ``_GAME_VISUAL_CUES``)
stay in ``classifier_service`` and are imported here.

Re-export contract: ``classifier_service`` re-exports
``classify_throw_timing_from_frames`` from this module, so existing
``from app.services.classification.classifier_service import
classify_throw_timing_from_frames`` imports keep working unchanged.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

import anthropic

from app.core.config import settings
from app.services.classification.classification_result import ThrowTimingResult
from app.services.classification.classifier_service import (
    _GAME_VISUAL_CUES,
    _strip_json_fences,
    _validate_grid_index,
)

logger = logging.getLogger(__name__)


_THROW_TIMING_SCHEMA_DOC = """\
You are given {n} numbered frames (Frame 1 .. Frame {n}) sampled in time order
from ONE chapter of a tactical-FPS lineup tutorial. Each frame is labelled with
its timestamp in seconds. The chapter is meant to demonstrate ONE utility throw
(smoke / molotov / flash / HE): the player lines up, RELEASES the
utility, and it produces a RESULT on the map.

Your ONLY job is to locate the throw in time:
  - which frame is the RELEASE (the utility leaves the player's hand), and
  - which frame is the RESULT (the utility's effect is first clearly visible).

Return ONLY bare JSON — no markdown fences, no preamble — with exactly these
keys:
{{
  "is_lineup_throw": boolean,
  "release_index": integer (1-{n}) or null,
  "result_index": integer (1-{n}) or null,
  "confidence": number (0.0-1.0),
  "reasoning": string (<= 80 words)
}}

Rules:
- is_lineup_throw: true if AT LEAST ONE frame in this set shows the player
  releasing a real first-person utility throw in the main game view. false
  ONLY when NO frame in the set shows a release — e.g., the whole chapter is
  an intro/outro splash, webcam-only / talking-head, a menu, a montage, or
  knife-only walking with no utility ever leaving the player's hand. When
  false, release_index AND result_index MUST be null.
  IMPORTANT: a chapter where SOME frames are title cards / knife-walking /
  talking-head but OTHERS show a real throw is still is_lineup_throw=true.
  The non-throw frames just become ineligible candidates — see
  CANDIDATE-FRAME EXCLUSIONS below.
- CANDIDATE-FRAME EXCLUSIONS: a frame matching ANY of the following MUST NOT
  be returned as release_index OR result_index, EVEN IF a release or result
  is partially visible behind the overlay. Search for a clean
  same-perspective frame elsewhere in the window instead. If every frame in
  the set is excluded, set the affected index to null and reduce confidence
  rather than forcing a pick on an excluded frame:
    - TITLE-CARD / LARGE-TEXT-OVERLAY frame: the frame is dominated by an
      intro splash, chapter banner, "SMOKE #N" / "LINEUP 3" / "PART 2"
      header, or a semi-transparent block of explanatory text covering
      >~25% of the frame. The standard HUD (minimap, ammo, money, small
      crosshair label) is NOT a title card; the disqualifying overlay is
      the BIG one that obscures the main game view.
    - KNIFE-ONLY-WALKING frame: the player has ONLY a knife (or no
      utility) in hand AND no utility is currently airborne / no smoke,
      flame, flash, or HE effect is unfolding in the world. This is the
      "walking between throws" state and contains zero release / result
      information. (Knife-in-hand AFTER a real release while the utility
      is mid-flight or blooming IS a valid result candidate — knife-alone
      is not the disqualifier; knife + nothing-happening is.)
    - WEBCAM / FACECAM dominant frame: a picture-in-picture / face tile
      covers most of the main game view.
    - REPLAY / KILL-CAM / SCOREBOARD / MENU / MAP-OVERVIEW frame: not the
      live first-person main game view.
- release_index: the 1-based frame where the utility is released, chosen from
  frames that pass CANDIDATE-FRAME EXCLUSIONS.
  RELEASE-INSTANT ANCHOR (operator audit 2026-05-25, highest priority within
  release-frame selection):
    The release_index is the FIRST frame where the utility OBJECT has
    SEPARATED from the player's hand. Two equally reliable signals — use
    whichever is visible in the candidate set; both together when both are
    visible:
      - UTILITY-SEPARATION FRAME (primary visual cue): the FIRST frame
        where the utility OBJECT has visibly separated from the player's
        hand. This is the canonical release instant — typically MID-SWING
        (the arm is still moving forward / at or just past peak
        extension), NOT after the swing has completed. The utility is now
        in the air a small distance from the hand, and the throwing hand
        is still extended in the throw direction, NOT yet retracted to a
        resting pose. Critical: by the time the arm has FULLY RETRACTED
        and the hand is back near the body, the projectile is already
        gone and the clip will catch only the tail of the throw motion
        (operator audit 2026-05-25, lineup 9b2ad4c9). The release instant
        is the SEPARATION, NOT the post-swing rest.
      - HUD GRENADE-SLOT DECREMENT: the utility icon in the bottom HUD
        (CS2: bottom-right grenade slot; Valorant: ability key indicator)
        flips from "ready / count-N" to "spent / count-(N-1) /
        icon-greyed". This is a SHARP single-frame transition and is the
        most reliable cue when the HUD is visible. In CS2 it fires within
        ~1 frame of UTILITY-SEPARATION; treat it as confirming the same
        anchor.
    DO NOT use "throw-animation follow-through" or "projectile arc
    visible mid-flight" or "post-swing hand-at-rest pose" as standalone
    release cues — they all fire frames AFTER the true release instant
    and shift the clip into result territory.
  ANTI-LANDING CONFUSION (the dominant failure mode per operator audit):
    If smoke / flames / flash-wash / HE-debris is visible IN THE WORLD on
    a candidate frame, the release ALREADY HAPPENED some frames earlier —
    do NOT pick the bloom-onset frame as release. Search BACKWARD in the
    candidate set for the UTILITY-SEPARATION frame / HUD-decrement
    transition. Picking the bloom instant as release shifts the entire
    clip 0.3-1.5s into result territory and the viewer sees the smoke
    unfurling instead of the throw arc. The bloom belongs on
    result_index, NEVER on release_index.
  ANTI-PRE-WINDUP (the opposite failure mode):
    If the utility is STILL in the player's hand on a candidate frame —
    held statically, charged-up, aimed-with, or mid-wind-up arc — that
    frame is BEFORE release. Search FORWARD in the candidate set for the
    UTILITY-SEPARATION frame. The wind-up, the lined-up aim, and the
    charge-up belong on the AIM pane, not the THROW clip.
  STRADDLE RULE:
    If the candidate set straddles release (frame N shows
    utility-still-in-hand; frame N+1 shows utility-separated-in-air AND
    bloom already visible), pick frame N+1 — it is the closest sample to
    the true release instant. The clip window pulls 1.0s of pre-release
    coverage so the viewer still sees the wind-up arc even when the
    chosen index is slightly past the literal release.
  Fallback: if no eligible frame shows a UTILITY-SEPARATION / HUD-
  decrement transition, choose the eligible frame immediately BEFORE the
  smoke / flame / flash / debris first appears in the world.
- result_index: the 1-based frame where the RESULT is first clearly visible
  FROM THE THROWER'S LINEUP POSITION, chosen from frames that pass
  CANDIDATE-FRAME EXCLUSIONS. It MUST be at or after release_index — a
  result cannot precede its own release.
  SAME-PERSPECTIVE RULE (highest priority, beats "first clearly visible"):
    The result frame MUST be from the SAME player position and viewing
    direction as release_index. Disqualifiers — if any apply, search EARLIER
    in the window for a valid frame:
      - background scenery has materially changed (new building, interior,
        different skyline, a window now framing it from the opposite side)
      - the player has rotated > ~45° from the release-frame's aim vector
      - the utility-in-hand has changed in a way that signals abandoning the
        lineup moment: smoke → molotov, smoke → flash, smoke → HE
        (smoke → rifle/pistol is fine — they switched back to their primary)
      - the player has walked into a different room or zone
    Pick a partial-deploy frame from the lineup position OVER a fully-bloomed
    frame from a rotated perspective.
  RESULT cues by utility (use the EARLIEST same-perspective frame that matches):
    SMOKE   - the FIRST visible wisp (typically 1.5-3.0s after release). Do
              NOT pick a late frame where the smoke is fully bloomed if an
              earlier same-perspective frame shows even partial deployment.
    MOLOTOV - the FIRST flame on the floor (typically 1.0-2.0s after release).
              Same earliness rule.
    FLASH   - white wash / detonation. If it is too fast to land on its own
              frame, set result_index = release_index and confidence <= 0.45.
    HE      - explosion burst / debris.
  MAX-GAP FALLBACK: result_index should normally be within ~6 frames (~2-4s)
    after release_index. If no valid same-perspective result frame exists in
    that range — because the utility traveled out of view, the player rotated
    immediately, or the chapter cut away — set result_index = release_index
    and confidence <= 0.5. Downstream consumers gate on confidence and will
    skip emitting a landing clip rather than ship a misleading one.
- confidence: 0-1 that you localised the throw correctly. Low when the throw is
  off-screen, cut away from, or only inferred from trajectory; high only when
  the release and the result are both directly visible AND both indices are
  on candidate-eligible frames.
- Discipline:
  - If the throw is shown repeatedly or from multiple angles, use the FIRST
    clean throw only.
  - Ignore picture-in-picture, facecam, killfeed, scoreboard, title cards and
    replays — judge from the main game view only.
  - A chapter that is ENTIRELY talking-head / knife-only-walking / menus /
    title cards with NO release in any frame → is_lineup_throw=false. A
    chapter that mixes a real throw with non-throw frames →
    is_lineup_throw=true and the non-throw frames are excluded from
    candidacy per CANDIDATE-FRAME EXCLUSIONS above (NOT a verdict flip).
- reasoning: <= 80 words. State the release cue, the result cue, which
  utility you keyed on, AND — if you skipped over any frames due to
  CANDIDATE-FRAME EXCLUSIONS — note which frame numbers and which exclusion
  rule (e.g. "skipped F3 title-card, F7 knife-walking").
"""


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
        + _GAME_VISUAL_CUES
        + "\n"
        + _THROW_TIMING_SCHEMA_DOC.format(n=n)
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
        parsed: dict[str, Any] = json.loads(_strip_json_fences(raw_text))
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

    release_index = _validate_grid_index(
        parsed.get("release_index"), "release_index", n, failures
    )
    result_index = _validate_grid_index(
        parsed.get("result_index"), "result_index", n, failures
    )

    # Frozen-contract parser enforcement: a result cannot precede its own
    # release. If the model returned both but inverted, force result to the
    # release frame and log (do NOT silently swap — the operator/dash should
    # be able to see this happened).
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
        result_index = release_index

    if failures:
        reasoning = f"{model_reasoning}\nNotes: {'; '.join(failures)}".strip()
    else:
        reasoning = model_reasoning

    logger.info(
        "throw_timing: is_lineup_throw=True chapter=%r n=%d release_idx=%s "
        "result_idx=%s confidence=%.2f",
        chapter_title, n, release_index, result_index, confidence or 0.0,
    )

    return ThrowTimingResult(
        success=True,
        is_lineup_throw=True,
        release_index=release_index,
        result_index=result_index,
        confidence=confidence,
        reasoning=reasoning,
        error_codes=list(structured_codes),
    )
