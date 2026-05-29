"""Post-parse classification scope guards (defense-in-depth).

Semantic guards that run AFTER the Claude JSON is parsed but BEFORE slug
resolution, enforcing game/map scope on the model's output. Pure functions over
the parsed dict + reference data — no DB, no SDK. Shared by the grid +
single-image entrypoints.

Extracted from the former ``classifier_service.py`` (a utility grab-bag) so the
scope guards have a cohesive home with PUBLIC names. (The operator map-scope
hard-lock, ``apply_map_hint``, lands here in a follow-up.)
"""
from __future__ import annotations

from typing import Any, Optional


def check_game_map_consistency(
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
