"""Claude single-image lineup classifier (re-classify path).

Runs at re-classify time on a single already-stored stand screenshot. Cannot
decide ``is_lineup`` (one arbitrary frame is exactly the input that made
ingestion unable to reject junk chapters) — for that, see the grid classifier
which runs at ingest time with N frames.

Shared helpers live in their own sibling modules:
  - ``prompts``: ``GAME_VISUAL_CUES``, ``GAME_FIRST_RULE``, ``build_reference_text``
  - ``scope_guards``: ``check_game_map_consistency``
  - ``screenshots``: ``fetch_screenshot_bytes``
"""
from __future__ import annotations

import base64
import json
import logging
import uuid
from typing import Any, Optional

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories.game import lineup_repo
from app.repositories.game.reference_repo import (
    load_reference_data,
    resolve_slugs,
)
from app.services.classification.classification_result import ClassificationResult
from app.services.classification.prompts import (
    GAME_FIRST_RULE,
    GAME_VISUAL_CUES,
    build_reference_text,
)
from app.services.classification.scope_guards import check_game_map_consistency
from app.services.classification.screenshots import fetch_screenshot_bytes

logger = logging.getLogger(__name__)


_OUTPUT_SCHEMA_DOC = """\
Return ONLY valid JSON with exactly these fields (no extra keys):
{
  "game_slug": string or null,
  "map_slug": string or null,
  "target_zone_slug": string or null,
  "stand_zone_slug": string or null,
  "side": "side_a" | "side_b" | "any" | null,
  "utility_type_slug": string or null,
  "aim_anchor_x": number (0.0-1.0) or null,
  "aim_anchor_y": number (0.0-1.0) or null,
  "confidence": number (0.0-1.0),
  "reasoning": string
}

Rules:
- aim_anchor_x and aim_anchor_y are the normalized (0-1) crosshair position in the screenshot provided.
  x=0 is left edge, x=1 is right edge; y=0 is top, y=1 is bottom.
- Set a field to null and explain in reasoning if you cannot determine it confidently.
- Only use slugs from the Valid reference lists provided; do not invent slugs.
- side_a = attacking/T side; side_b = defending/CT side; any = side-agnostic.
"""


async def classify_lineup(
    db: AsyncSession,
    lineup_id: uuid.UUID,
    *,
    game_hint: Optional[str] = None,
) -> ClassificationResult:
    """Classify a single lineup and write suggestions back to the DB row.

    Args:
        db: Active async database session.
        lineup_id: UUID of the Lineup row to classify.
        game_hint: Optional game slug hint (e.g. from channel metadata).

    Returns:
        ClassificationResult with success=True and suggested FK values on
        success, or success=False and error_codes populated on failure.

    Side effect: on success, writes suggested_* fields to the Lineup row
    and flushes (caller must commit).
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "classify_lineup: ANTHROPIC_API_KEY not configured — skipping lineup_id=%s",
            lineup_id,
        )
        return ClassificationResult(
            success=False,
            error_codes=["missing_api_key"],
            reasoning="ANTHROPIC_API_KEY not configured",
        )

    lineup = await lineup_repo.get_lineup(db, lineup_id)
    if lineup is None:
        logger.error("classify_lineup: lineup not found: lineup_id=%s", lineup_id)
        return ClassificationResult(
            success=False,
            error_codes=["lineup_not_found"],
            reasoning=f"Lineup {lineup_id} not found",
        )

    ref = await load_reference_data(db, game_id=lineup.game_id)

    screenshot_bytes = fetch_screenshot_bytes(lineup.stand_screenshot_url)
    if screenshot_bytes is None:
        logger.warning(
            "classify_lineup: no screenshot bytes available: lineup_id=%s key=%s",
            lineup_id, lineup.stand_screenshot_url,
        )
        return ClassificationResult(
            success=False,
            error_codes=["no_screenshot"],
            reasoning="Stand screenshot not available for classification",
        )

    reference_text = build_reference_text(ref, game_hint=game_hint)

    chapter_context_parts: list[str] = []
    if lineup.chapter_title:
        chapter_context_parts.append(f"Chapter title: {lineup.chapter_title}")
    if lineup.attribution_author:
        chapter_context_parts.append(f"Source channel: {lineup.attribution_author}")
    if lineup.title and lineup.title != lineup.chapter_title:
        chapter_context_parts.append(f"Lineup title: {lineup.title}")
    chapter_context = "\n".join(chapter_context_parts)

    system_prompt = (
        "You are classifying tactical-FPS utility lineup screenshots.\n"
        "Your task: identify the game, map, zones, side, and utility type from the screenshot "
        "and chapter metadata. Return the crosshair/aim anchor position on the aim screenshot.\n\n"
        + GAME_VISUAL_CUES
        + "\n"
        + GAME_FIRST_RULE
        + "\n"
        + _OUTPUT_SCHEMA_DOC
    )

    image_b64 = base64.standard_b64encode(screenshot_bytes).decode()

    user_content: list[dict] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": image_b64,
            },
        },
    ]
    if chapter_context:
        user_content.append({"type": "text", "text": chapter_context})
    user_content.append(
        {
            "type": "text",
            "text": reference_text,
            "cache_control": {"type": "ephemeral"},
        }
    )

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=settings.claude_classifier_model,
            max_tokens=500,
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
            "classify_lineup: rate limit hit: lineup_id=%s error_type=%s message=%s",
            lineup_id, error_type, str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API rate limit: {exc}",
        )
    except anthropic.APIStatusError as exc:
        error_type = getattr(exc, "type", None) or f"api_status_{exc.status_code}"
        logger.error(
            "classify_lineup: API status error: lineup_id=%s error_type=%s status_code=%s message=%s",
            lineup_id, error_type, exc.status_code, str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error ({exc.status_code}): {exc}",
        )
    except anthropic.APIError as exc:
        error_type = getattr(exc, "type", "api_error") or "api_error"
        logger.error(
            "classify_lineup: API error: lineup_id=%s error_type=%s message=%s",
            lineup_id, error_type, str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error: {exc}",
        )

    raw_text = response.content[0].text if response.content else ""
    try:
        clean = raw_text.strip()
        if clean.startswith("```"):
            clean = clean.split("```", 2)[1]
            if clean.startswith("json"):
                clean = clean[4:]
            clean = clean.strip()
        parsed: dict[str, Any] = json.loads(clean)
    except (json.JSONDecodeError, IndexError) as exc:
        logger.error(
            "classify_lineup: JSON parse failed: lineup_id=%s raw=%r error=%s",
            lineup_id, raw_text[:200], str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=["json_parse_error"],
            reasoning=f"Could not parse classifier JSON: {exc}",
        )

    failures: list[str] = []
    structured_codes: list[str] = []
    parsed = check_game_map_consistency(parsed, ref, failures, structured_codes)

    (
        game_id,
        map_id,
        target_zone_id,
        stand_zone_id,
        utility_type_id,
        slug_failures,
        slug_codes,
    ) = await resolve_slugs(
        db,
        game_slug=parsed.get("game_slug"),
        map_slug=parsed.get("map_slug"),
        target_zone_slug=parsed.get("target_zone_slug"),
        stand_zone_slug=parsed.get("stand_zone_slug"),
        utility_type_slug=parsed.get("utility_type_slug"),
    )
    failures.extend(slug_failures)
    structured_codes.extend(slug_codes)

    side = parsed.get("side")
    if side is not None and side not in ("side_a", "side_b", "any"):
        failures.append(f"invalid side value '{side}' — must be side_a/side_b/any")
        structured_codes.append(f"invalid_side:{side}")
        side = None

    aim_x: Optional[float] = None
    aim_y: Optional[float] = None
    raw_x = parsed.get("aim_anchor_x")
    raw_y = parsed.get("aim_anchor_y")
    if raw_x is not None:
        try:
            aim_x = float(raw_x)
            if not (0.0 <= aim_x <= 1.0):
                failures.append(f"aim_anchor_x={aim_x} out of range [0,1]")
                aim_x = None
        except (TypeError, ValueError):
            failures.append(f"aim_anchor_x '{raw_x}' is not a number")
    if raw_y is not None:
        try:
            aim_y = float(raw_y)
            if not (0.0 <= aim_y <= 1.0):
                failures.append(f"aim_anchor_y={aim_y} out of range [0,1]")
                aim_y = None
        except (TypeError, ValueError):
            failures.append(f"aim_anchor_y '{raw_y}' is not a number")

    confidence: Optional[float] = None
    raw_conf = parsed.get("confidence")
    if raw_conf is not None:
        try:
            confidence = max(0.0, min(1.0, float(raw_conf)))
        except (TypeError, ValueError):
            logger.warning(
                "classify_lineup: invalid confidence value dropped: "
                "lineup_id=%s raw_confidence=%r",
                lineup_id, raw_conf,
            )
            failures.append(
                f"invalid confidence value '{raw_conf}' — not a number; treated as null"
            )
            structured_codes.append(f"invalid_confidence:{raw_conf}")

    model_reasoning = str(parsed.get("reasoning") or "")
    if failures:
        failure_note = "Slug resolution failures: " + "; ".join(failures)
        reasoning = f"{model_reasoning}\n{failure_note}".strip()
    else:
        reasoning = model_reasoning

    logger.info(
        "classify_lineup: success: lineup_id=%s game=%s map=%s "
        "target_zone=%s side=%s utility=%s confidence=%.2f",
        lineup_id,
        parsed.get("game_slug"),
        parsed.get("map_slug"),
        parsed.get("target_zone_slug"),
        side,
        parsed.get("utility_type_slug"),
        confidence or 0.0,
    )

    await lineup_repo.write_classifier_suggestions(
        db,
        lineup,
        {
            "aim_anchor_x": aim_x,
            "aim_anchor_y": aim_y,
            "suggested_game_id": game_id,
            "suggested_map_id": map_id,
            "suggested_target_zone_id": target_zone_id,
            "suggested_stand_zone_id": stand_zone_id,
            "suggested_side": side,
            "suggested_utility_type_id": utility_type_id,
            "classification_confidence": confidence,
            "classification_reasoning": reasoning,
        },
    )

    return ClassificationResult(
        success=True,
        suggested_game_id=game_id,
        suggested_map_id=map_id,
        suggested_target_zone_id=target_zone_id,
        suggested_stand_zone_id=stand_zone_id,
        suggested_side=side,
        suggested_utility_type_id=utility_type_id,
        aim_anchor_x=aim_x,
        aim_anchor_y=aim_y,
        confidence=confidence,
        reasoning=reasoning,
        error_codes=list(structured_codes),
        classification_failures=list(structured_codes),
    )
