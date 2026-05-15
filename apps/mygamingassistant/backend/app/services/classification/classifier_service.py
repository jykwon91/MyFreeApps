"""Claude lineup classifier service.

Classifies a single pending_review Lineup by:
  1. Fetching the lineup row + stand screenshot bytes from MinIO.
  2. Loading game/map/zone/utility reference data for the prompt.
  3. Calling Claude Haiku with a vision prompt (image + text context).
  4. Parsing the JSON response and resolving slugs → FK UUIDs.
  5. Writing suggested values back to the Lineup row (status stays pending_review).

Cost targets per rules/token-cost-reduction:
  - Model: claude-haiku-4-5-20251001 (cheapest vision model)
  - max_tokens: 500 (classification JSON is small)
  - Prompt caching: system prompt + reference data are cached
    (the image + chapter title change per call; everything else is constant
    across calls for the same game).

Error handling per rules/check-third-party-error-codes.md:
  - anthropic.APIError, RateLimitError, APIStatusError are caught.
  - error.type is logged as a structured field + sent to Sentry.
  - Returns ClassificationResult(success=False, error_codes=[...]) on failure.
  - No automatic retry (rate limits compound). User can re-classify from UI.
"""
from __future__ import annotations

import json
import logging
import uuid
from io import BytesIO
from typing import Any, Optional

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.repositories.game.lineup_repo import write_classifier_suggestions
from app.services.classification.classification_result import ClassificationResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Classification output schema (passed to Claude as a system-level schema
# description; also used for response parsing).
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Reference data loader
# ---------------------------------------------------------------------------


async def _load_reference_data(
    db: AsyncSession,
    game_id: Optional[uuid.UUID],
) -> dict[str, Any]:
    """Load all valid slugs for a game (or all games if game_id is None).

    Returns a dict with keys:
      games: list[{slug, name, side_a_label, side_b_label}]
      maps: list[{slug, name, game_slug, zones: [{slug, name}]}]
      utility_types: list[{slug, name, game_slug}]
    """
    # Load all games
    game_rows = (await db.execute(select(Game).order_by(Game.slug))).scalars().all()

    # Load all maps (with zones eagerly if needed)
    if game_id is not None:
        map_rows = (
            await db.execute(
                select(Map)
                .where(Map.game_id == game_id)
                .order_by(Map.slug)
            )
        ).scalars().all()
        ut_rows = (
            await db.execute(
                select(UtilityType)
                .where(UtilityType.game_id == game_id)
                .order_by(UtilityType.slug)
            )
        ).scalars().all()
        target_game_ids = {game_id}
    else:
        map_rows = (await db.execute(select(Map).order_by(Map.game_id, Map.slug))).scalars().all()
        ut_rows = (
            await db.execute(select(UtilityType).order_by(UtilityType.game_id, UtilityType.slug))
        ).scalars().all()
        target_game_ids = {g.id for g in game_rows}

    # Load zones for all target maps
    map_ids = [m.id for m in map_rows]
    if map_ids:
        zone_rows = (
            await db.execute(
                select(MapZone)
                .where(MapZone.map_id.in_(map_ids))
                .order_by(MapZone.map_id, MapZone.slug)
            )
        ).scalars().all()
    else:
        zone_rows = []

    # Build lookup: game.id → game.slug
    game_id_to_slug = {g.id: g.slug for g in game_rows}

    # Build map list with zones
    map_id_to_zones: dict[uuid.UUID, list[dict]] = {}
    for zone in zone_rows:
        map_id_to_zones.setdefault(zone.map_id, []).append(
            {"slug": zone.slug, "name": zone.name}
        )

    games_ref = [
        {
            "slug": g.slug,
            "name": g.name,
            "side_a_label": g.side_a_label,
            "side_b_label": g.side_b_label,
        }
        for g in game_rows
    ]

    maps_ref = [
        {
            "slug": m.slug,
            "name": m.name,
            "game_slug": game_id_to_slug.get(m.game_id, ""),
            "zones": map_id_to_zones.get(m.id, []),
        }
        for m in map_rows
    ]

    utility_types_ref = [
        {
            "slug": ut.slug,
            "name": ut.name,
            "game_slug": game_id_to_slug.get(ut.game_id, ""),
        }
        for ut in ut_rows
    ]

    return {
        "games": games_ref,
        "maps": maps_ref,
        "utility_types": utility_types_ref,
    }


# ---------------------------------------------------------------------------
# Reference text block builder (cache breakpoint candidate)
# ---------------------------------------------------------------------------


def _build_reference_text(ref: dict[str, Any], game_hint: Optional[str] = None) -> str:
    """Build the reference text block passed to Claude.

    This text is constant across calls for the same game → prime candidate for
    prompt caching. We mark it with a cache_control breakpoint in the message.
    """
    lines: list[str] = []

    if game_hint:
        lines.append(f"Expected game: {game_hint}")
        lines.append("")

    lines.append("Valid games (slug → name):")
    for g in ref["games"]:
        lines.append(
            f"  {g['slug']} → {g['name']}"
            f" [side_a={g['side_a_label']}, side_b={g['side_b_label']}]"
        )

    lines.append("")
    lines.append("Valid maps with zones (map_slug → game_slug, [zone_slugs]):")
    for m in ref["maps"]:
        zone_slugs = ", ".join(z["slug"] for z in m["zones"]) if m["zones"] else "(no zones)"
        lines.append(f"  {m['slug']} [{m['game_slug']}]: {zone_slugs}")

    lines.append("")
    lines.append("Valid utility types (slug → name, game):")
    for ut in ref["utility_types"]:
        lines.append(f"  {ut['slug']} [{ut['game_slug']}] → {ut['name']}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Slug → FK resolver
# ---------------------------------------------------------------------------


async def _resolve_slugs(
    db: AsyncSession,
    game_slug: Optional[str],
    map_slug: Optional[str],
    target_zone_slug: Optional[str],
    stand_zone_slug: Optional[str],
    utility_type_slug: Optional[str],
) -> tuple[
    Optional[uuid.UUID],  # game_id
    Optional[uuid.UUID],  # map_id
    Optional[uuid.UUID],  # target_zone_id
    Optional[uuid.UUID],  # stand_zone_id
    Optional[uuid.UUID],  # utility_type_id
    list[str],            # resolution_failures
]:
    """Resolve classifier-returned slugs to database FK UUIDs.

    Returns a tuple of (game_id, map_id, target_zone_id, stand_zone_id,
    utility_type_id, resolution_failures).

    resolution_failures is a list of human-readable strings for any slug that
    could not be resolved — appended to the reasoning field.
    """
    failures: list[str] = []

    # Resolve game
    game_id: Optional[uuid.UUID] = None
    if game_slug:
        row = (await db.execute(select(Game).where(Game.slug == game_slug))).scalar_one_or_none()
        if row:
            game_id = row.id
        else:
            failures.append(f"game slug '{game_slug}' not found in DB")

    # Resolve map (requires game_id)
    map_id: Optional[uuid.UUID] = None
    if map_slug and game_id:
        row = (
            await db.execute(
                select(Map).where(Map.game_id == game_id, Map.slug == map_slug)
            )
        ).scalar_one_or_none()
        if row:
            map_id = row.id
        else:
            failures.append(f"map slug '{map_slug}' not found for game '{game_slug}'")
    elif map_slug and not game_id:
        failures.append(f"cannot resolve map slug '{map_slug}' — game slug failed")

    # Resolve zones (require map_id)
    target_zone_id: Optional[uuid.UUID] = None
    if target_zone_slug and map_id:
        row = (
            await db.execute(
                select(MapZone).where(
                    MapZone.map_id == map_id, MapZone.slug == target_zone_slug
                )
            )
        ).scalar_one_or_none()
        if row:
            target_zone_id = row.id
        else:
            failures.append(f"target_zone slug '{target_zone_slug}' not found on map '{map_slug}'")
    elif target_zone_slug and not map_id:
        failures.append(f"cannot resolve target_zone slug '{target_zone_slug}' — map slug failed")

    stand_zone_id: Optional[uuid.UUID] = None
    if stand_zone_slug and map_id:
        row = (
            await db.execute(
                select(MapZone).where(
                    MapZone.map_id == map_id, MapZone.slug == stand_zone_slug
                )
            )
        ).scalar_one_or_none()
        if row:
            stand_zone_id = row.id
        else:
            failures.append(f"stand_zone slug '{stand_zone_slug}' not found on map '{map_slug}'")
    elif stand_zone_slug and not map_id:
        failures.append(f"cannot resolve stand_zone slug '{stand_zone_slug}' — map slug failed")

    # Resolve utility type (requires game_id)
    utility_type_id: Optional[uuid.UUID] = None
    if utility_type_slug and game_id:
        row = (
            await db.execute(
                select(UtilityType).where(
                    UtilityType.game_id == game_id,
                    UtilityType.slug == utility_type_slug,
                )
            )
        ).scalar_one_or_none()
        if row:
            utility_type_id = row.id
        else:
            failures.append(
                f"utility_type slug '{utility_type_slug}' not found for game '{game_slug}'"
            )
    elif utility_type_slug and not game_id:
        failures.append(
            f"cannot resolve utility_type slug '{utility_type_slug}' — game slug failed"
        )

    return game_id, map_id, target_zone_id, stand_zone_id, utility_type_id, failures


# ---------------------------------------------------------------------------
# Screenshot loader
# ---------------------------------------------------------------------------


def _fetch_screenshot_bytes(key: Optional[str]) -> Optional[bytes]:
    """Fetch a screenshot from MinIO by object key. Returns None if key is empty."""
    if not key:
        return None
    try:
        from app.core.storage import get_storage

        storage = get_storage()
        # Use internal client for server-side reads (no presigning needed).
        from platform_shared.core.storage import _DualEndpointStorageClient

        client = storage._client if not isinstance(storage, _DualEndpointStorageClient) else storage._client
        response = client.get_object(storage.bucket, key)
        data = response.read()
        response.close()
        response.release_conn()
        return data
    except Exception as exc:
        logger.warning(
            "classifier: failed to fetch screenshot: key=%s error=%s",
            key, str(exc),
        )
        return None


# ---------------------------------------------------------------------------
# Main classify function
# ---------------------------------------------------------------------------


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

    # Load lineup
    lineup = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one_or_none()
    if lineup is None:
        logger.error("classify_lineup: lineup not found: lineup_id=%s", lineup_id)
        return ClassificationResult(
            success=False,
            error_codes=["lineup_not_found"],
            reasoning=f"Lineup {lineup_id} not found",
        )

    # Load reference data (all games/maps/zones/utility types)
    ref = await _load_reference_data(db, game_id=lineup.game_id)

    # Fetch stand screenshot bytes
    screenshot_bytes = _fetch_screenshot_bytes(lineup.stand_screenshot_url)
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

    # Build reference text (cached breakpoint — changes only when game data changes)
    reference_text = _build_reference_text(ref, game_hint=game_hint)

    # Build chapter context (changes per lineup)
    chapter_context_parts: list[str] = []
    if lineup.chapter_title:
        chapter_context_parts.append(f"Chapter title: {lineup.chapter_title}")
    if lineup.attribution_author:
        chapter_context_parts.append(f"Source channel: {lineup.attribution_author}")
    if lineup.title and lineup.title != lineup.chapter_title:
        chapter_context_parts.append(f"Lineup title: {lineup.title}")
    chapter_context = "\n".join(chapter_context_parts)

    # Build the Claude request
    # System prompt with cache_control — static across all classification calls
    system_prompt = (
        "You are classifying tactical-FPS utility lineup screenshots.\n"
        "Your task: identify the game, map, zones, side, and utility type from the screenshot "
        "and chapter metadata. Return the crosshair/aim anchor position on the aim screenshot.\n\n"
        + _OUTPUT_SCHEMA_DOC
    )

    import base64
    image_b64 = base64.standard_b64encode(screenshot_bytes).decode()

    # Per-call user content: image first, then chapter context, then reference
    # data with cache_control to enable prompt caching on the stable parts.
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

    # Reference data block — cache_control marks this as a cache breakpoint.
    # Everything above this (system prompt + this block) will be cached
    # when the content is identical across calls.
    user_content.append(
        {
            "type": "text",
            "text": reference_text,
            "cache_control": {"type": "ephemeral"},
        }
    )

    # Call Claude
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

    # Parse response
    raw_text = response.content[0].text if response.content else ""
    try:
        # Strip markdown code fences if present
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

    # Resolve slugs to FK IDs
    game_id, map_id, target_zone_id, stand_zone_id, utility_type_id, failures = (
        await _resolve_slugs(
            db,
            game_slug=parsed.get("game_slug"),
            map_slug=parsed.get("map_slug"),
            target_zone_slug=parsed.get("target_zone_slug"),
            stand_zone_slug=parsed.get("stand_zone_slug"),
            utility_type_slug=parsed.get("utility_type_slug"),
        )
    )

    # Validate side
    side = parsed.get("side")
    if side is not None and side not in ("side_a", "side_b", "any"):
        failures.append(f"invalid side value '{side}' — must be side_a/side_b/any")
        side = None

    # Validate aim anchor coords
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

    # Validate confidence
    confidence: Optional[float] = None
    raw_conf = parsed.get("confidence")
    if raw_conf is not None:
        try:
            confidence = max(0.0, min(1.0, float(raw_conf)))
        except (TypeError, ValueError):
            pass

    # Build reasoning string
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

    # Write suggestions back to the lineup row via the repo (status stays pending_review)
    await write_classifier_suggestions(
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
        error_codes=[],
    )
