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
# Shared parser helpers (used by extracted classifier modules)
# ---------------------------------------------------------------------------


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




# ---------------------------------------------------------------------------
# Extracted Claude code paths — re-exported here so callers can keep importing
# from classifier_service unchanged. Late imports — must come AFTER the shared
# blocks (_GAME_VISUAL_CUES, _GAME_FIRST_RULE, _build_reference_text,
# _check_game_map_consistency, _fetch_screenshot_bytes, _strip_json_fences,
# _validate_aim_coord, _validate_grid_index) are defined, since the extracted
# modules import them.
#   - single_image_classifier (PR R2 — classify_lineup)
#   - grid_classifier (PR R2 — classify_frames_for_lineup_decision)
#   - throw_timing_classifier (PR #754)
#   - throw_technique_classifier (PR R1)
# ---------------------------------------------------------------------------
from app.services.classification.single_image_classifier import (  # noqa: E402
    classify_lineup,
)
from app.services.classification.grid_classifier import (  # noqa: E402
    classify_frames_for_lineup_decision,
)
from app.services.classification.throw_timing_classifier import (  # noqa: E402
    classify_throw_timing_from_frames,
)
from app.services.classification.throw_technique_classifier import (  # noqa: E402
    classify_throw_technique_from_frames,
)
