"""Claude throw-technique classifier — glance-board footer text.

A SEPARATE Claude code path from BOTH the grid classifier and the PR2
throw-timing call. It does not classify game/map/zone/side/utility, does not
resolve slugs, does not touch the DB, and is independent of the clip outcome
(technique is extracted even when the clip was gated off for low timing
confidence / no release frame). Its only job: given the same dense throw
window, name HOW the throw is executed as a compact <=60-char phrase for the
glance-board footer (frozen design contract pr3-throw-technique-design.md).

Extracted from classifier_service.py in PR R1 to keep that file under the
1000-LOC god-module threshold (TECH_DEBT.md). The shared helper
``_strip_json_fences`` stays in ``classifier_service`` and is imported here.

Re-export contract: ``classifier_service`` re-exports
``classify_throw_technique_from_frames`` from this module, so existing
``from app.services.classification.classifier_service import
classify_throw_technique_from_frames`` imports keep working unchanged.

Game technique vocabularies are structurally incompatible (CS2 mouse buttons
vs Valorant ability keys), so the right phrase is game-specific. The game is
known at the call site (ingest grid suggestion >0.6, or the accepted
lineup.game_id at backfill); the vocab block is per-call user text (NOT
cached — it varies by game), while the schema/system prompt IS cached.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

import anthropic

from app.core.config import settings
from app.services.classification.classification_result import ThrowTechniqueResult
from app.services.classification.classifier_service import _strip_json_fences

logger = logging.getLogger(__name__)


_CS2_TECHNIQUE_VOCAB = """\
GAME: CS2. Use the CS2 technique vocabulary ONLY.
Throw type (movement at release): standing, jumpthrow, run-throw, walk-throw,
crouch-throw, jumpthrow-bind.
Mouse buttons: LMB (left = full/far throw), RMB (right = short underhand lob),
LMB+RMB (both = soft/bounce).
Compact form: "<throw type> + <mouse>" — e.g. "Standing + LMB",
"Jumpthrow + LMB", "Run + RMB", "Walk + LMB+RMB", "Crouch + LMB".
Cues: movement = does the player jump / run / walk / crouch / stay still just
before the throw-animation follow-through? Mouse = the HUD grenade-slot throw
animation and the projectile arc (long arc = LMB; short lob = RMB; soft bounce
= LMB+RMB).
"""

_VALORANT_TECHNIQUE_VOCAB = """\
GAME: Valorant. Use the Valorant technique vocabulary ONLY.
Ability key: C, Q, E, or X (ultimate). NO mouse-button component.
Charge tiers (Sova bow etc.): 1-charge, 2-charge, 3-charge, full-charge.
Bounce count (Sova bow etc.): 0-bounce, 1-bounce, 2-bounce.
Aim qualifier (other agents): aimed, instant-cast, held-cast.
Compact form: "<key>[ + <charge>][ + <bounce/aim>]" — e.g.
"E + 2-charge + 1-bounce", "C + aimed", "Q + full-charge", "X + held-cast".
Cues: which ability slot icon (C/Q/E/X) is consumed; bow charge dots / count;
number of wall/world bounces before the result lands.
"""

_GENERIC_TECHNIQUE_VOCAB = """\
GAME UNKNOWN — determine it from the HUD before naming technique:
- CS2: dollar buy-money like $3800, grenade icons in the weapon list, T/CT.
- Valorant: C/Q/E/X ability icons bottom-centre, "creds" economy, agent
  portraits on the minimap.
Then apply that game's technique vocabulary:
- CS2: "<standing|jumpthrow|run-throw|walk-throw|crouch-throw> + <LMB|RMB|
  LMB+RMB>".
- Valorant: "<C|Q|E|X>[ + <charge>][ + <bounce|aimed|held-cast>]" (no mouse).
"""


def _technique_vocab_block(game_slug: Optional[str]) -> str:
    """Pick the per-call technique-vocabulary text block for the game.

    Unknown / unrecognized game → the generic block, which asks the model to
    determine the game from the HUD first (the same game-first discipline the
    grid classifier enforces via _GAME_FIRST_RULE).
    """
    normalized = (game_slug or "").strip().lower()
    if normalized == "cs2":
        return _CS2_TECHNIQUE_VOCAB
    if normalized == "valorant":
        return _VALORANT_TECHNIQUE_VOCAB
    return _GENERIC_TECHNIQUE_VOCAB


_THROW_TECHNIQUE_SCHEMA_DOC = """\
You are given {n} numbered frames (Frame 1 .. Frame {n}) sampled in time order
from ONE chapter of a tactical-FPS lineup tutorial. Each frame is labelled with
its timestamp in seconds. The chapter is meant to demonstrate ONE utility
throw.

Your ONLY job is to name the THROW TECHNIQUE — HOW the player executes the
throw (the body movement + the input), as a single compact phrase. You are
NOT identifying the game/map/zone/utility and NOT locating the throw in time.

Return ONLY bare JSON — no markdown fences, no preamble — with exactly these
keys:
{{
  "technique": string (<= 60 chars) or null,
  "confidence": number (0.0-1.0),
  "reasoning": string (<= 60 words)
}}

Rules:
- technique: a compact phrase per the GAME TECHNIQUE VOCABULARY block supplied
  below. <= 60 characters. Separators only "+", "-", "/". A partial answer is
  fine — if the movement is visible but the mouse button / charge is not, give
  just the movement ("Jumpthrow"); if only the input is visible, give just
  that. Set technique to null when the throw motion is not visible in these
  frames (static setup only, no release), or you are not confident enough to
  name it. NEVER guess.
- confidence: 0-1 that the technique you named is correct. High ONLY when the
  throw movement and the input are directly observable; low when inferred.
- reasoning: <= 60 words. State the visual cue(s) that led to the technique
  (which frame shows the jump/run/crouch, which input cue you keyed on).
- Discipline:
  - If the throw is shown repeatedly or from multiple angles, use the FIRST
    clean throw only.
  - Ignore picture-in-picture, facecam, killfeed, scoreboard, title cards and
    replays — judge from the main game view only.
  - Talking-head, menu, or knife-only-walking frames are NOT a throw:
    technique = null, confidence low.
"""

# Module-level so tests can patch it and so it sits visibly alongside its PR2
# counterpart (clip_generator._CLIP_CONFIDENCE_GATE). Identical 0.55 value by
# design — the footer renders technique as unqualified fact on a
# trust-at-a-glance mid-game surface, so a confidently-wrong technique costs a
# round. One mental model with the clip gate.
_TECHNIQUE_CONFIDENCE_GATE = 0.55


async def classify_throw_technique_from_frames(
    *,
    frames: list[bytes],
    frame_timestamps: list[float],
    chapter_title: Optional[str],
    chapter_duration: Optional[float],
    game_slug: Optional[str] = None,
) -> ThrowTechniqueResult:
    """Name the throw technique within ONE chapter as a compact phrase.

    Separate Claude code path from :func:`classify_frames_for_lineup_decision`
    and :func:`classify_throw_timing_from_frames` (own prompt, own schema, no
    reference data, no slug resolution, no DB). Decoupled from the clip
    pipeline so technique is still produced when the clip was gated off.

    Args:
        frames: Downscaled candidate PNG bytes, in time order (the SAME dense
            throw window the clip pipeline uses —
            ``frame_extractor.clip_window_timestamps``; extracted
            independently per the PR3 contract's documented deviation).
        frame_timestamps: The timestamp (seconds) of each frame, same order
            and length as *frames*. Surfaced to the model as load-bearing
            context (``Frame i (t=..s):``).
        chapter_title: YouTube chapter title (per-call context).
        chapter_duration: Chapter length in seconds (per-call context).
        game_slug: The game ("cs2" / "valorant") — selects the per-call
            technique-vocabulary block. None → the generic block asks the
            model to determine the game from the HUD first.

    Returns:
        ThrowTechniqueResult. ``success=True`` with ``technique=None`` is a
        valid "cannot determine" answer (not-a-throw / motion not visible /
        below the 0.55 confidence gate), NOT an error. ``error_codes`` is
        populated only on an API/parse failure, plus the structured gate code
        on an otherwise-successful sub-threshold call.
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "throw_technique: ANTHROPIC_API_KEY not configured — skipping "
            "(chapter=%r)", chapter_title,
        )
        return ThrowTechniqueResult(
            success=False,
            error_codes=["missing_api_key"],
            reasoning="ANTHROPIC_API_KEY not configured",
        )

    if not frames:
        return ThrowTechniqueResult(
            success=False,
            error_codes=["no_frames"],
            reasoning="No candidate frames supplied to throw-technique classifier",
        )

    if len(frames) != len(frame_timestamps):
        # A frame/timestamp length mismatch would misalign the load-bearing
        # per-frame timestamp labels. Fail loud (no silent-fail), mirroring
        # the throw-timing classifier's identical guard.
        return ThrowTechniqueResult(
            success=False,
            error_codes=["frame_timestamp_mismatch"],
            reasoning=(
                f"frames ({len(frames)}) and frame_timestamps "
                f"({len(frame_timestamps)}) length mismatch"
            ),
        )

    n = len(frames)

    system_prompt = (
        "You are a tactical-FPS utility-lineup video analyst specializing in "
        "throw mechanics. You will be shown several timestamped frames from "
        "one chapter of a lineup tutorial and must name HOW the throw is "
        "executed — the technique.\n\n"
        + _THROW_TECHNIQUE_SCHEMA_DOC.format(n=n)
    )

    # Per-call content: each frame labelled with its 1-based index AND its
    # timestamp, then the per-chapter context block (incl. the game-specific
    # technique vocabulary). Frames are the variable part (NOT cached); the
    # system prompt is cache_control'd.
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
    context_parts.append(_technique_vocab_block(game_slug))
    user_content.append({"type": "text", "text": "\n".join(context_parts)})

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=settings.claude_classifier_model,
            max_tokens=300,
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
            "throw_technique: rate limit hit: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return ThrowTechniqueResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API rate limit: {exc}",
        )
    except anthropic.APIStatusError as exc:
        error_type = getattr(exc, "type", None) or f"api_status_{exc.status_code}"
        logger.error(
            "throw_technique: API status error: chapter=%r error_type=%s "
            "status_code=%s message=%s",
            chapter_title, error_type, exc.status_code, str(exc),
        )
        return ThrowTechniqueResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error ({exc.status_code}): {exc}",
        )
    except anthropic.APIError as exc:
        error_type = getattr(exc, "type", "api_error") or "api_error"
        logger.error(
            "throw_technique: API error: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return ThrowTechniqueResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error: {exc}",
        )

    raw_text = response.content[0].text if response.content else ""
    try:
        parsed: dict[str, Any] = json.loads(_strip_json_fences(raw_text))
    except (json.JSONDecodeError, IndexError) as exc:
        logger.error(
            "throw_technique: JSON parse failed: chapter=%r raw=%r error=%s",
            chapter_title, raw_text[:200], str(exc),
        )
        return ThrowTechniqueResult(
            success=False,
            error_codes=["json_parse_error"],
            reasoning=f"Could not parse throw-technique JSON: {exc}",
        )

    structured_codes: list[str] = []

    technique: Optional[str] = None
    technique_raw = parsed.get("technique")
    if technique_raw is not None:
        if not isinstance(technique_raw, str):
            structured_codes.append(
                f"invalid_technique_type:{type(technique_raw).__name__}"
            )
        else:
            technique = technique_raw.strip()[:80] or None

    confidence: Optional[float] = None
    raw_conf = parsed.get("confidence")
    if raw_conf is not None:
        try:
            confidence = max(0.0, min(1.0, float(raw_conf)))
        except (TypeError, ValueError):
            logger.warning(
                "throw_technique: invalid confidence value dropped: "
                "chapter=%r raw_confidence=%r",
                chapter_title, raw_conf,
            )
            structured_codes.append(f"invalid_confidence:{raw_conf}")

    model_reasoning = str(parsed.get("reasoning") or "")

    # 0.55 confidence gate via module-level _TECHNIQUE_CONFIDENCE_GATE; matches
    # clip_generator._CLIP_CONFIDENCE_GATE. The footer renders technique as
    # unqualified fact on a trust-at-a-glance mid-game surface, so a
    # sub-threshold (or confidence-unknown) technique is dropped to null rather
    # than shown. NOT a silent drop: emit a structured code + WARNING so the
    # operator can see how often technique falls below the bar.
    if technique is not None:
        if confidence is None:
            logger.warning(
                "throw_technique: technique %r dropped — no usable confidence: "
                "chapter=%r",
                technique, chapter_title,
            )
            structured_codes.append("technique_no_confidence")
            technique = None
        elif confidence < _TECHNIQUE_CONFIDENCE_GATE:
            logger.warning(
                "throw_technique: technique %r dropped — confidence %.2f < "
                "%.2f: chapter=%r",
                technique, confidence, _TECHNIQUE_CONFIDENCE_GATE,
                chapter_title,
            )
            structured_codes.append(f"technique_low_confidence:{confidence:.2f}")
            technique = None

    logger.info(
        "throw_technique: chapter=%r n=%d technique=%r confidence=%.2f",
        chapter_title, n, technique, confidence or 0.0,
    )

    return ThrowTechniqueResult(
        success=True,
        technique=technique,
        confidence=confidence,
        reasoning=model_reasoning,
        error_codes=list(structured_codes),
    )
