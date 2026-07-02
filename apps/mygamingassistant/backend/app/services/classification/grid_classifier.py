"""Claude grid classifier (Strategy A — ingest-time, N candidate frames).

Runs at ingest time, while the source video is still on disk. Takes N
evenly-spaced candidate frames and asks Claude to:

  1. decide ``is_lineup`` — is this chapter a real tactical-FPS utility
     lineup demo at all (the real "stop junk" mechanism); and
  2. pick ``best_stand_index`` / ``best_aim_index`` — which of the N frames
     best shows the player position and the crosshair on the alignment
     marker (PR #757 enforces these MUST be distinct moments); and
  3. classify the game/map/zone/side/utility/aim-anchor fields.

Does NOT touch the database (no lineup row exists yet — the orchestrator
creates the row only if ``is_lineup`` is True). Reference data is loaded for
slug resolution.

Shared helpers live in their own sibling modules:
  - ``prompts``: ``GAME_VISUAL_CUES``, ``GAME_FIRST_RULE``, ``build_reference_text``
  - ``response_parsing``: ``strip_json_fences``, ``validate_aim_coord``, ``validate_grid_index``
  - ``scope_guards``: ``check_game_map_consistency``, ``apply_map_hint``
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
from app.services.classification.response_parsing import (
    strip_json_fences,
    validate_aim_coord,
    validate_grid_index,
)
from app.services.classification.scope_guards import (
    apply_agent_hint,
    apply_map_hint,
    check_game_map_consistency,
)

logger = logging.getLogger(__name__)


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
- map_slug — CHAPTER-TITLE ZONE-NAME CONSISTENCY CHECK (operator audit 2026-05-25):
  Before finalizing map_slug, scan the chapter title for words that match a
  zone name or zone slug listed under EXACTLY ONE map of your chosen
  game_slug. If a chapter-title word uniquely identifies a map (e.g.
  "Jungle" is a Mirage zone but not a zone on any other CS2 map in the
  reference list), the chosen map_slug MUST be that map. If matching
  zones exist on multiple maps (e.g. "Catwalk" exists on both Mirage and
  Dust2), use visual cues — minimap radar shape, signature architecture,
  wall textures — to disambiguate, and explicitly state the visual cue
  in reasoning. NEVER cite landmark names in reasoning unless they are
  actually visible in the candidate frames; on-screen overlay text from
  the YouTuber is metadata about the chapter, NOT evidence of which map
  is being demonstrated.
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


async def classify_frames_for_lineup_decision(
    db: AsyncSession,
    *,
    frames: list[bytes],
    chapter_title: Optional[str],
    attribution_author: Optional[str],
    game_hint: Optional[str] = None,
    map_hint: Optional[str] = None,
    agent_hint: Optional[str] = None,
) -> ClassificationResult:
    """Strategy A: classify a chapter from N candidate frames at ingest time.

    ``map_hint`` is the operator's per-source map scope (Source.config_json
    ``map_hint``). When set, the chosen map is hard-locked to it (see
    :func:`app.services.classification.scope_guards.apply_map_hint`) so a
    single-map source can never spawn lineups on a different map — the
    recurrence fix for cross-map misclassification.

    ``agent_hint`` is the operator's per-source Valorant agent scope
    (Source.config_json ``agent_hint``). When set, the utility candidate list is
    narrowed to that agent's abilities in the prompt and the classified utility
    is hard-locked to it post-parse (see
    :func:`app.services.classification.scope_guards.apply_agent_hint`) — the
    recurrence fix for cross-agent utility misclassification (a Sova recon dart
    tagged as Brimstone ``sky-smoke``).
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

    ref = await load_reference_data(db, game_id=None)
    # A map scope implies its game; surface that to the game line too (the map
    # list itself is restricted to map_hint inside build_reference_text).
    effective_game_hint = game_hint
    if map_hint:
        _map_game = {m["slug"]: m["game_slug"] for m in ref.get("maps", [])}
        effective_game_hint = _map_game.get(map_hint, game_hint)
    reference_text = build_reference_text(
        ref, game_hint=effective_game_hint, map_hint=map_hint, agent_hint=agent_hint
    )

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
        + GAME_VISUAL_CUES
        + "\n"
        + GAME_FIRST_RULE
        + "\n"
        + _GRID_OUTPUT_SCHEMA_DOC.format(n=n)
    )

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
            max_tokens=700,
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
        parsed: dict[str, Any] = json.loads(strip_json_fences(raw_text))
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

    # When the source is map-scoped, hard-lock the map (the load-bearing
    # recurrence fix); otherwise fall back to the cross-game contamination
    # guard. map_hint forces the map's own game, so the cross-game check is
    # moot in that branch.
    if map_hint:
        parsed = apply_map_hint(parsed, ref, map_hint, failures, structured_codes)
    else:
        parsed = check_game_map_consistency(parsed, ref, failures, structured_codes)

    # Agent scope is orthogonal to map scope — apply it regardless of which map
    # branch ran above. No-op unless agent_hint owns an ability in the ref data.
    if agent_hint:
        parsed = apply_agent_hint(parsed, ref, agent_hint, failures, structured_codes)

    is_lineup = bool(parsed.get("is_lineup"))

    best_stand_index = validate_grid_index(
        parsed.get("best_stand_index"), "best_stand_index", n, failures
    )
    best_aim_index = validate_grid_index(
        parsed.get("best_aim_index"), "best_aim_index", n, failures
    )

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

    aim_x = validate_aim_coord(parsed.get("aim_anchor_x"), "x", failures)
    aim_y = validate_aim_coord(parsed.get("aim_anchor_y"), "y", failures)

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
