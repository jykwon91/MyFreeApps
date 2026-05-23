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

import base64
import json
import logging
import uuid
from io import BytesIO
from typing import Any, Optional

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories.game import lineup_repo
from app.repositories.game.reference_repo import (
    load_reference_data,
    resolve_slugs,
)
from app.services.classification.classification_result import (
    ClassificationResult,
    ThrowTechniqueResult,
    ThrowTimingResult,
)

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
# Visual game-identification cues (cached in system prompt — never changes)
#
# MAINTENANCE COUPLING: when a new game is added to the fixture data
# (app/fixtures/), this cue list MUST be extended with that game's
# distinguishing HUD/art-style signals and the NAME-COLLISION WARNING updated.
# A reference list that grows a third game without a matching visual-cue block
# reintroduces exactly the cross-game contamination this constant prevents.
# ---------------------------------------------------------------------------

_GAME_VISUAL_CUES = """\
HOW TO IDENTIFY THE GAME FROM THE SCREEN:

Look for these signals BEFORE reading any map or zone names:

CS2 (Counter-Strike 2):
- Realistic Source 2 military/urban art style — concrete, grime, realistic lighting
- Bottom-left HUD: dollar amount like $3800 (buy money), health + armor number with
  a small helmet/vest icon when kevlar equipped
- Left-side weapon list (primary + secondary + grenades as small icons stacked vertically)
- Minimap in a corner showing teammates as colored dots, bomb carrier marker
- Round timer at top center; "Bomb" (C4) as a throwable; no agent ability icons
- Grenades are the utility: smoke, flashbang, HE grenade, Molotov/incendiary
- Scoreboard uses T / CT team labels with a knife/bomb icon

Valorant:
- Stylized/cel-shaded art — sharp outlines, saturated colors, sci-fi or fantasy architecture
- Bottom-center HUD: four ability icons labeled C / Q / E / X (ultimate), often with charge
  dots or a numeric charge counter beneath each
- Economy shows "creds" (credits) not dollar signs; buy menu shows numbered cred costs
- Minimap corner shows agent icons (character portraits) not generic colored dots
- "Spike" is the bomb equivalent (not "Bomb"); spike plant animation is distinct
- Ultimate orbs visible on minimap/map as glowing collectibles
- Agent-specific ability effects on screen (e.g. Sage wall, Jett dash trail, Killjoy turret)

NAME-COLLISION WARNING:
Many zone names appear in BOTH games: "A Site", "B Site", "Mid", "T Spawn", "CT Spawn",
"Market", "A Main", "B Main". Recognizing a zone name is NOT evidence of the game.
The game must be determined from visual HUD and art-style cues ONLY.
"""

_GAME_FIRST_RULE = """\
CLASSIFICATION ORDER — YOU MUST FOLLOW THIS SEQUENCE:
1. DETERMINE game_slug FIRST from visual HUD and art cues (see above).
   Do not read map or zone names yet. If you cannot confidently identify the
   game from the visuals, set game_slug=null and all slug fields to null.
2. Once game_slug is set, filter the reference lists to entries where
   [game_slug] matches your determined game. IGNORE all other entries.
3. Select map_slug, zone slugs, and utility_type_slug ONLY from the filtered set.
   Never select a slug whose [game_slug] differs from your game_slug.
4. In the "reasoning" field, state: (a) which visual cue(s) confirmed the game,
   (b) which map you identified, and (c) why you chose the zones you chose.
"""

# Strategy A grid schema. The model decides whether the chapter is a real
# lineup demo and picks two DISTINCT frames: one for the player's standing
# position (best_stand_index) and one for the crosshair on the alignment
# marker (best_aim_index). aim_anchor_* are relative to best_aim_index.
_GRID_OUTPUT_SCHEMA_DOC = """\
You are given {n} numbered candidate frames (Frame 1 .. Frame {n}) sampled at
even intervals across ONE YouTube chapter from a tactical-FPS video. The
chapter MIGHT be a real utility-lineup demonstration (player walks to a spot,
lines up a smoke/molly/flash/grenade throw against a wall/skybox marker, throws
it, and the result lands on a bombsite/choke) OR it might be junk (intro/outro,
webcam talking-head, gameplay montage, kill highlights, menu, loading screen,
title card). Most chapters in a mixed video are NOT lineups.

Return ONLY valid JSON with exactly these fields (no extra keys):
{{
  "is_lineup": boolean,
  "best_stand_index": integer (1-{n}) or null,
  "best_aim_index": integer (1-{n}) or null,
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
}}

Rules:
- is_lineup: true ONLY if at least one frame clearly shows in-game tactical-FPS
  gameplay consistent with a utility lineup (HUD/minimap visible, a throwable
  equipped or its effect mid-air/landing, a recognizable map location). If the
  frames are webcam, desktop, montage, menus, title cards, or unrelated
  gameplay, set is_lineup=false and set the index/slug fields to null.
- game_slug: follow CLASSIFICATION ORDER above — determine from visual cues first, then
  constrain all map/zone/utility slugs to entries tagged [<your game_slug>] in the
  reference list.
- best_stand_index: the frame showing the PLAYER POSITION at the throw spot.
  Feet/ground/local environment dominant; crosshair on a LOCAL reference
  (standing tile, doorframe, nearby corner), NOT the throw's alignment
  marker. The "I am at the spot" frame — after arrival, before rotating to
  aim. Utility equipped, projectile not airborne. null if is_lineup is false.
- best_aim_index: the frame showing the CROSSHAIR ON THE ALIGNMENT MARKER —
  the specific visual point (skybox feature, building corner, antenna, wire,
  texture detail) the player is throwing toward. Sky/skybox or distant-map
  dominant; camera angled UP or across, NOT down at the ground. The
  "crosshair is on the marker" frame, immediately before release. MUST be a
  DIFFERENT frame from best_stand_index AND come AFTER it in time (arrive →
  STAND → rotate up → AIM → release). If no separate aim-on-marker frame
  exists (player throws on arrival, aim moment off-camera), set
  best_aim_index to null and reduce confidence — do NOT duplicate
  best_stand_index. null if is_lineup is false.
- aim_anchor_x / aim_anchor_y: normalized (0-1) crosshair position IN THE
  best_aim_index FRAME. x=0 left, x=1 right; y=0 top, y=1 bottom. null if
  is_lineup is false or you cannot locate the crosshair.
- confidence: your overall confidence (0-1) that this is a usable lineup AND the
  classification is correct. Low confidence on junk; high only when sure.
- Set any field to null and explain in reasoning if you cannot determine it.
- Only use slugs from the Valid reference lists provided; do not invent slugs.
- side_a = attacking/T side; side_b = defending/CT side; any = side-agnostic.
"""


# ---------------------------------------------------------------------------
# Reference text block builder (cache breakpoint candidate)
# ---------------------------------------------------------------------------


def _build_reference_text(ref: dict[str, Any], game_hint: Optional[str] = None) -> str:
    """Build the reference text block passed to Claude.

    Constant across calls for the same game → prime candidate for prompt
    caching. The reference data comes from
    :func:`app.repositories.game.reference_repo.load_reference_data`; this
    function shapes it into the system-prompt text Claude reads.
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
# Post-parse cross-game consistency guard (defense-in-depth)
# ---------------------------------------------------------------------------


def _check_game_map_consistency(
    parsed: dict[str, Any],
    ref: dict[str, Any],
    failures: list[str],
    codes: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Hard cross-game rejection: returned map_slug MUST belong to returned game_slug.

    This is the all-games (unknown-game / ingest grid) defence. When the
    reference data is game-scoped (known game), this is a redundant belt — the
    slug resolver's game_id-gated queries already make a cross-game resolution
    return zero rows by construction. On the all-games path the resolver alone
    cannot reject it (every game's slugs are valid rows), so this guard makes
    cross-game contamination impossible *before* resolution: if the map slug
    exists in the reference data under a DIFFERENT game than ``game_slug``, the
    map/zone fields are nulled (so they cannot resolve to the wrong game's FKs)
    and a STRUCTURED reject code is emitted (not prose-only).

    Behaviour on mismatch:
      - null out map_slug, target_zone_slug, stand_zone_slug
      - reduce confidence by 0.4 (floor 0.0) — a mismatch is low-trust
      - append a human note to ``failures`` (flows into reasoning)
      - append ``cross_game_rejected:...`` to ``codes`` if provided
        (flows into ClassifyResponse.error_codes — machine-readable)
      - leave game_slug, side, utility_type_slug, aim_anchor_* intact
    """
    game_slug = parsed.get("game_slug")
    map_slug = parsed.get("map_slug")
    if not game_slug or not map_slug:
        return parsed
    map_game_lookup: dict[str, str] = {
        m["slug"]: m["game_slug"] for m in ref.get("maps", [])
    }
    actual_game = map_game_lookup.get(map_slug)
    if actual_game is None:
        return parsed  # slug resolver will catch a truly-absent slug
    if actual_game != game_slug:
        failures.append(
            f"CROSS-GAME MISMATCH: game_slug='{game_slug}' but map_slug='{map_slug}' "
            f"belongs to '{actual_game}' — nulling map/zone fields; confidence reduced"
        )
        if codes is not None:
            codes.append(
                f"cross_game_rejected:map={map_slug}:"
                f"classified={game_slug}:actual={actual_game}"
            )
        result = dict(parsed)
        result["map_slug"] = None
        result["target_zone_slug"] = None
        result["stand_zone_slug"] = None
        raw_conf = result.get("confidence")
        if raw_conf is not None:
            try:
                result["confidence"] = max(0.0, float(raw_conf) - 0.4)
            except (TypeError, ValueError):
                result["confidence"] = 0.0
        return result
    return parsed


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
    lineup = await lineup_repo.get_lineup(db, lineup_id)
    if lineup is None:
        logger.error("classify_lineup: lineup not found: lineup_id=%s", lineup_id)
        return ClassificationResult(
            success=False,
            error_codes=["lineup_not_found"],
            reasoning=f"Lineup {lineup_id} not found",
        )

    # Load reference data (all games/maps/zones/utility types)
    ref = await load_reference_data(db, game_id=lineup.game_id)

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
        + _GAME_VISUAL_CUES
        + "\n"
        + _GAME_FIRST_RULE
        + "\n"
        + _OUTPUT_SCHEMA_DOC
    )

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

    # Defense-in-depth: catch cross-game contamination (e.g. game_slug='valorant'
    # but map_slug='mirage') BEFORE slug resolution so the wrong map/zones are
    # nulled and confidence is penalized. Notes flow into the same failures list
    # that feeds the reasoning string.
    failures: list[str] = []
    structured_codes: list[str] = []
    parsed = _check_game_map_consistency(parsed, ref, failures, structured_codes)

    # Resolve slugs to FK IDs
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

    # Validate side
    side = parsed.get("side")
    if side is not None and side not in ("side_a", "side_b", "any"):
        failures.append(f"invalid side value '{side}' — must be side_a/side_b/any")
        structured_codes.append(f"invalid_side:{side}")
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

    # Validate confidence. A non-numeric confidence is a real diagnosable
    # signal (the model returned a malformed score), NOT something to silently
    # drop — match this file's exemplary Anthropic error handling: structured
    # log + structured code + keep going (confidence stays None, never crash).
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

    # The call SUCCEEDED, but advertised slugs may have failed to resolve /
    # been cross-game-rejected. Surface those as STRUCTURED codes through the
    # existing error_codes path so the operator/UI sees machine-readable
    # "zone slug 'X' advertised but unresolved for game cs2" rather than
    # having to parse the reasoning blob (per check-third-party-error-codes).
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


# ---------------------------------------------------------------------------
# Strategy A — multi-frame grid classifier (ingest-time only)
# ---------------------------------------------------------------------------
#
# The legacy classify_lineup() above runs at *re-classify* time: the source
# video is already deleted, only the two stored screenshots survive, so it can
# only re-judge a single stand image. It deliberately CANNOT decide is_lineup
# (one arbitrary frame is exactly the input that made the original ingestion
# unable to reject junk chapters — see the g-debug-bug diagnosis).
#
# classify_lineup_from_frames() runs at *ingest* time, while the video is still
# on disk: it is handed N evenly-spaced candidate frames and is the actual
# lineup detector + frame picker (Strategy A). This asymmetry is expected and
# documented, not a bug.


def _strip_json_fences(raw_text: str) -> str:
    """Strip a leading ```json / ``` markdown fence if Claude added one."""
    clean = raw_text.strip()
    if clean.startswith("```"):
        clean = clean.split("```", 2)[1]
        if clean.startswith("json"):
            clean = clean[4:]
        clean = clean.strip()
    return clean


def _validate_aim_coord(
    value: Any, axis: str, failures: list[str]
) -> Optional[float]:
    """Validate one normalized aim-anchor coordinate (shared with single-image path)."""
    if value is None:
        return None
    try:
        coord = float(value)
    except (TypeError, ValueError):
        failures.append(f"aim_anchor_{axis} '{value}' is not a number")
        return None
    if not (0.0 <= coord <= 1.0):
        failures.append(f"aim_anchor_{axis}={coord} out of range [0,1]")
        return None
    return coord


def _validate_grid_index(
    value: Any, field_name: str, n: int, failures: list[str]
) -> Optional[int]:
    """Validate a 1-based frame index returned by the grid classifier.

    Returns the 1-based int if it is an integer within [1, n], else None and
    appends a human-readable note to *failures*.
    """
    if value is None:
        return None
    try:
        idx = int(value)
    except (TypeError, ValueError):
        failures.append(f"{field_name} '{value}' is not an integer")
        return None
    if not (1 <= idx <= n):
        failures.append(f"{field_name}={idx} out of range [1,{n}]")
        return None
    return idx


async def classify_frames_for_lineup_decision(
    db: AsyncSession,
    *,
    frames: list[bytes],
    chapter_title: Optional[str],
    attribution_author: Optional[str],
    game_hint: Optional[str] = None,
) -> ClassificationResult:
    """Strategy A: classify a chapter from N candidate frames at ingest time.

    Unlike :func:`classify_lineup`, this takes the raw frame bytes in memory
    (the video is still on disk during ingestion) and asks Claude to:

      1. decide ``is_lineup`` — is this chapter a real tactical-FPS utility
         lineup demo at all (the real "stop junk" mechanism); and
      2. pick ``best_stand_index`` / ``best_aim_index`` — which of the N frames
         best shows the throw stance and the aim/result; and
      3. classify the usual game/map/zone/side/utility/aim-anchor fields.

    It does NOT touch the database (no lineup row exists yet — the orchestrator
    creates the row only if ``is_lineup`` is True, using the chosen frames).
    Reference data is still loaded for slug resolution.

    Cost: one cheap-model (haiku) call with N images. Reference data + system
    prompt are cache_control-marked so they're billed once per game, not per
    chapter. N is capped by the caller (orchestrator uses N=5) to bound tokens.

    Args:
        db: Active async session (read-only here — reference data + slug resolve).
        frames: Candidate PNG byte strings, in chapter start→end order. The
            1-based ``best_*_index`` values index into this list.
        chapter_title: YouTube chapter title (per-call context).
        attribution_author: Source channel name (per-call context).
        game_hint: Optional game slug hint from source metadata.

    Returns:
        ClassificationResult. On a successful call ``success=True`` and
        ``is_lineup`` reflects Claude's judgement (it may be False — that is a
        successful *call* with a "this is junk" answer, not an error).
        ``error_codes`` is populated only on an API/parse failure.
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "classify_frames: ANTHROPIC_API_KEY not configured — skipping "
            "(chapter=%r)", chapter_title,
        )
        return ClassificationResult(
            success=False,
            error_codes=["missing_api_key"],
            reasoning="ANTHROPIC_API_KEY not configured",
        )

    if not frames:
        return ClassificationResult(
            success=False,
            error_codes=["no_frames"],
            reasoning="No candidate frames supplied to grid classifier",
        )

    n = len(frames)

    # Reference data spans all games when there's no row yet (ingest time has
    # no lineup.game_id). The game_hint narrows the prompt textually.
    ref = await load_reference_data(db, game_id=None)
    reference_text = _build_reference_text(ref, game_hint=game_hint)

    chapter_context_parts: list[str] = []
    if chapter_title:
        chapter_context_parts.append(f"Chapter title: {chapter_title}")
    if attribution_author:
        chapter_context_parts.append(f"Source channel: {attribution_author}")
    chapter_context = "\n".join(chapter_context_parts)

    system_prompt = (
        "You are classifying tactical-FPS utility lineup screenshots.\n"
        "You will receive several numbered candidate frames from ONE video "
        "chapter and must judge whether the chapter is a real utility-lineup "
        "demo, pick the best frames, and classify it.\n\n"
        + _GAME_VISUAL_CUES
        + "\n"
        + _GAME_FIRST_RULE
        + "\n"
        + _GRID_OUTPUT_SCHEMA_DOC.format(n=n)
    )

    # Per-call content: each numbered frame as a labelled image, then chapter
    # context, then the cache_control'd reference block. Images are the
    # variable part (not cached); system + reference are cached.
    user_content: list[dict] = []
    for i, frame_bytes in enumerate(frames, start=1):
        user_content.append({"type": "text", "text": f"Frame {i}:"})
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
            max_tokens=700,  # grid: is_lineup + 2 indices + richer game-evidence reasoning
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
            "classify_frames: rate limit hit: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API rate limit: {exc}",
        )
    except anthropic.APIStatusError as exc:
        error_type = getattr(exc, "type", None) or f"api_status_{exc.status_code}"
        logger.error(
            "classify_frames: API status error: chapter=%r error_type=%s "
            "status_code=%s message=%s",
            chapter_title, error_type, exc.status_code, str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error ({exc.status_code}): {exc}",
        )
    except anthropic.APIError as exc:
        error_type = getattr(exc, "type", "api_error") or "api_error"
        logger.error(
            "classify_frames: API error: chapter=%r error_type=%s message=%s",
            chapter_title, error_type, str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=[error_type],
            reasoning=f"Claude API error: {exc}",
        )

    raw_text = response.content[0].text if response.content else ""
    try:
        parsed: dict[str, Any] = json.loads(_strip_json_fences(raw_text))
    except (json.JSONDecodeError, IndexError) as exc:
        logger.error(
            "classify_frames: JSON parse failed: chapter=%r raw=%r error=%s",
            chapter_title, raw_text[:200], str(exc),
        )
        return ClassificationResult(
            success=False,
            error_codes=["json_parse_error"],
            reasoning=f"Could not parse classifier JSON: {exc}",
        )

    failures: list[str] = []
    structured_codes: list[str] = []

    # Hard cross-game rejection (ingest grid is the all-games path — the slug
    # resolver alone can't reject cross-game here, so this guard makes a
    # Valorant map under a CS2 game_slug impossible BEFORE resolution, nulling
    # the wrong map/zones and emitting a structured cross_game_rejected code).
    parsed = _check_game_map_consistency(parsed, ref, failures, structured_codes)

    is_lineup = bool(parsed.get("is_lineup"))

    best_stand_index = _validate_grid_index(
        parsed.get("best_stand_index"), "best_stand_index", n, failures
    )
    best_aim_index = _validate_grid_index(
        parsed.get("best_aim_index"), "best_aim_index", n, failures
    )

    # Match the single-image path: a non-numeric confidence is a diagnosable
    # signal, not a silent drop. Structured log + structured code + keep going.
    confidence: Optional[float] = None
    raw_conf = parsed.get("confidence")
    if raw_conf is not None:
        try:
            confidence = max(0.0, min(1.0, float(raw_conf)))
        except (TypeError, ValueError):
            logger.warning(
                "classify_frames: invalid confidence value dropped: "
                "chapter=%r raw_confidence=%r",
                chapter_title, raw_conf,
            )
            failures.append(
                f"invalid confidence value '{raw_conf}' — not a number; treated as null"
            )
            structured_codes.append(f"invalid_confidence:{raw_conf}")

    model_reasoning = str(parsed.get("reasoning") or "")

    # If Claude says it's not a lineup, don't bother resolving slugs — the
    # orchestrator will skip the row entirely. Return early with the verdict.
    if not is_lineup:
        reasoning = model_reasoning or "Classifier judged chapter is not a lineup."
        logger.info(
            "classify_frames: is_lineup=False chapter=%r n=%d confidence=%.2f",
            chapter_title, n, confidence or 0.0,
        )
        return ClassificationResult(
            success=True,
            is_lineup=False,
            best_stand_index=None,
            best_aim_index=None,
            confidence=confidence,
            reasoning=reasoning,
            error_codes=list(structured_codes),
            classification_failures=list(structured_codes),
        )

    # is_lineup True → resolve the classification slugs as usual.
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

    aim_x = _validate_aim_coord(parsed.get("aim_anchor_x"), "x", failures)
    aim_y = _validate_aim_coord(parsed.get("aim_anchor_y"), "y", failures)

    if failures:
        reasoning = f"{model_reasoning}\nNotes: {'; '.join(failures)}".strip()
    else:
        reasoning = model_reasoning

    logger.info(
        "classify_frames: is_lineup=True chapter=%r n=%d stand_idx=%s aim_idx=%s "
        "game=%s map=%s confidence=%.2f",
        chapter_title, n, best_stand_index, best_aim_index,
        parsed.get("game_slug"), parsed.get("map_slug"), confidence or 0.0,
    )

    return ClassificationResult(
        success=True,
        is_lineup=True,
        best_stand_index=best_stand_index,
        best_aim_index=best_aim_index,
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


# ---------------------------------------------------------------------------
# Extracted Claude code paths — re-exported here so callers can keep importing
# from classifier_service unchanged. Late imports — must come AFTER
# _GAME_VISUAL_CUES + _strip_json_fences + _validate_grid_index are defined,
# since the extracted modules import them.
#   - throw_timing_classifier (PR #754)
#   - throw_technique_classifier (PR R1)
# ---------------------------------------------------------------------------
from app.services.classification.throw_timing_classifier import (  # noqa: E402
    classify_throw_timing_from_frames,
)
from app.services.classification.throw_technique_classifier import (  # noqa: E402
    classify_throw_technique_from_frames,
)
