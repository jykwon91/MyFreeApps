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
from app.services.classification.classification_result import (
    ClassificationResult,
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
- Grenades are the utility: smoke, flashbang, HE grenade, Molotov/incendiary, decoy
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

# Strategy A grid schema. The model is given N numbered candidate frames
# sampled across the chapter and must (a) decide whether the chapter is a real
# utility-lineup demo at all, and (b) pick which frame best shows the throwing
# stance and which best shows the aim/result. The aim_anchor_* coordinates are
# relative to the chosen best_aim_index frame.
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
- best_stand_index: the 1-based frame number that best shows the player STANDING
  at the throw position lining up the utility (crosshair on the alignment
  marker, throwable equipped, before release). null if is_lineup is false.
- best_aim_index: the 1-based frame number that best shows the AIM/RESULT — the
  crosshair placement for the throw or the utility landing on target. May equal
  best_stand_index if one frame shows both. null if is_lineup is false.
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


def _slug_failure_code(field_name: str, slug: str, *, game_slug: Optional[str]) -> str:
    """Build a stable, machine-readable failure code for an unresolved slug.

    Shape: ``unresolved_slug:<field>:<slug>:game=<game_slug or '?'>``.
    The classifier ADVERTISED this slug in the reference list it was given,
    yet it did not resolve against the (game-scoped) DB — so this is a
    diagnosable signal, not prose. Surfaced via error_codes so the operator
    sees "zone slug 'X' advertised but unresolved for game cs2" instead of
    guessing from a reasoning blob.
    """
    return f"unresolved_slug:{field_name}:{slug}:game={game_slug or '?'}"


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
    list[str],            # resolution_failures (human prose)
    list[str],            # structured failure codes
]:
    """Resolve classifier-returned slugs to database FK UUIDs.

    Returns a 7-tuple of (game_id, map_id, target_zone_id, stand_zone_id,
    utility_type_id, resolution_failures, structured_codes).

    resolution_failures is a list of human-readable strings for any slug that
    could not be resolved — appended to the reasoning field.

    structured_codes mirrors each failure as a stable, parseable token (see
    :func:`_slug_failure_code`) so the operator/UI gets a machine-readable
    "this advertised slug did not resolve" signal via
    ClassifyResponse.error_codes — not prose-only (per
    rules/check-third-party-error-codes.md: a wrapper that knows WHY it
    failed must not collapse to a bare null/prose blob).

    Game scoping is HARD here by construction: map/zone/utility lookups are
    gated on a successfully-resolved ``game_id`` AND every query filters by
    that ``game_id``. A Valorant-only zone slug therefore cannot resolve in a
    CS2 classification (different ``game_id`` → zero rows), independent of
    what the prompt advertised.
    """
    failures: list[str] = []
    codes: list[str] = []

    # Resolve game
    game_id: Optional[uuid.UUID] = None
    if game_slug:
        row = (await db.execute(select(Game).where(Game.slug == game_slug))).scalar_one_or_none()
        if row:
            game_id = row.id
        else:
            failures.append(f"game slug '{game_slug}' not found in DB")
            codes.append(_slug_failure_code("game", game_slug, game_slug=game_slug))

    # Resolve map (requires game_id — hard game scope: map MUST belong to the
    # resolved game; a cross-game map slug yields zero rows here).
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
            codes.append(_slug_failure_code("map", map_slug, game_slug=game_slug))
    elif map_slug and not game_id:
        failures.append(f"cannot resolve map slug '{map_slug}' — game slug failed")
        codes.append(_slug_failure_code("map", map_slug, game_slug=game_slug))

    # Resolve zones (require map_id, which already requires game_id → zones are
    # transitively game-scoped: a Valorant zone cannot resolve on a CS2 map).
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
            codes.append(
                _slug_failure_code("target_zone", target_zone_slug, game_slug=game_slug)
            )
    elif target_zone_slug and not map_id:
        failures.append(f"cannot resolve target_zone slug '{target_zone_slug}' — map slug failed")
        codes.append(
            _slug_failure_code("target_zone", target_zone_slug, game_slug=game_slug)
        )

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
            codes.append(
                _slug_failure_code("stand_zone", stand_zone_slug, game_slug=game_slug)
            )
    elif stand_zone_slug and not map_id:
        failures.append(f"cannot resolve stand_zone slug '{stand_zone_slug}' — map slug failed")
        codes.append(
            _slug_failure_code("stand_zone", stand_zone_slug, game_slug=game_slug)
        )

    # Resolve utility type (requires game_id — hard game scope identical to map).
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
            codes.append(
                _slug_failure_code("utility_type", utility_type_slug, game_slug=game_slug)
            )
    elif utility_type_slug and not game_id:
        failures.append(
            f"cannot resolve utility_type slug '{utility_type_slug}' — game slug failed"
        )
        codes.append(
            _slug_failure_code("utility_type", utility_type_slug, game_slug=game_slug)
        )

    return (
        game_id,
        map_id,
        target_zone_id,
        stand_zone_id,
        utility_type_id,
        failures,
        codes,
    )


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
        + _GAME_VISUAL_CUES
        + "\n"
        + _GAME_FIRST_RULE
        + "\n"
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
    ) = await _resolve_slugs(
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
    ref = await _load_reference_data(db, game_id=None)
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

    import base64

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
    ) = await _resolve_slugs(
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
# PR2 — throw-timing localizer (clip pipeline)
# ---------------------------------------------------------------------------
#
# A SEPARATE Claude code path from classify_frames_for_lineup_decision. It does
# NOT classify game/map/zone/side/utility and does NOT resolve slugs or touch
# the DB — its only job is to find, within ONE chapter, the frame the utility
# is RELEASED and the frame its RESULT first shows, so the caller can cut a
# tight gif-style clip around the throw. Conflating it with the grid classifier
# would couple two prompts that must evolve independently (frozen design
# contract pr2-clip-localization-design.md).


_THROW_TIMING_SCHEMA_DOC = """\
You are given {n} numbered frames (Frame 1 .. Frame {n}) sampled in time order
from ONE chapter of a tactical-FPS lineup tutorial. Each frame is labelled with
its timestamp in seconds. The chapter is meant to demonstrate ONE utility throw
(smoke / molotov / flash / HE / decoy): the player lines up, RELEASES the
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
- is_lineup_throw: true ONLY if these frames show a real first-person utility
  throw in the main game view. false for intro/outro/title cards, webcam or
  talking-head, knife-only walking, menus, montages, or anything that is not an
  actual throw — when false, release_index AND result_index MUST be null.
- release_index: the 1-based frame where the utility is released. RELEASE cues:
  the projectile is first airborne; the throw-animation follow-through; the HUD
  grenade/ability slot empties. If no frame catches the exact release, choose
  the frame immediately BEFORE the effect first appears.
- result_index: the 1-based frame where the RESULT is first clearly visible. It
  MUST be at or after release_index — a result cannot precede its own release.
  RESULT cues by utility:
    SMOKE   - grey/white cloud expanding (count the FIRST wisp; a canister
              still in flight is NOT yet the result).
    MOLOTOV - orange floor flame spreading.
    FLASH   - white wash / detonation. If it is too fast to land on its own
              frame, set result_index = release_index and confidence <= 0.45.
    HE      - explosion burst / debris.
    DECOY   - landed canister with a small ground smoke puff.
- confidence: 0-1 that you localised the throw correctly. Low when the throw is
  off-screen, cut away from, or only inferred from trajectory; high only when
  the release and the result are both directly visible.
- Discipline:
  - If the throw is shown repeatedly or from multiple angles, use the FIRST
    clean throw only.
  - Ignore picture-in-picture, facecam, killfeed, scoreboard, title cards and
    replays — judge from the main game view only.
  - Talking-head or knife-only-walking frames are NOT a throw:
    is_lineup_throw=false, both indices null.
- reasoning: <= 80 words. State the release cue, the result cue, and which
  utility you keyed on.
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
        + _THROW_TIMING_SCHEMA_DOC.format(n=n)
    )

    import base64

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
