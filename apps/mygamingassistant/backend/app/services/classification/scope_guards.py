"""Post-parse classification scope guards (defense-in-depth).

Semantic guards that run AFTER the Claude JSON is parsed but BEFORE slug
resolution, enforcing game/map scope on the model's output. Pure functions over
the parsed dict + reference data — no DB, no SDK. Shared by the grid +
single-image entrypoints.

Extracted from the former ``classifier_service.py`` (a utility grab-bag) so the
scope guards have a cohesive home with PUBLIC names. Both the cross-game
contamination guard (``check_game_map_consistency``) and the operator map-scope
hard-lock (``apply_map_hint``) live here.
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


def apply_map_hint(
    parsed: dict[str, Any],
    ref: dict[str, Any],
    map_hint: str,
    failures: list[str],
    codes: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Hard-lock classification to the operator-supplied source map scope.

    The operator scopes a single-map source by setting ``map_hint`` (a map
    slug) in Source.config_json. This is the load-bearing recurrence fix for
    cross-MAP-within-one-game misclassification: a pure-Mirage video whose
    "Catwalk" / "Jungle" / "Ticket" chapter titles led the classifier to guess
    dust2 / ancient (callout names that are more famous on those maps, even
    though all three are also Mirage zones). The prompt-only chapter-title
    consistency nudge proved insufficient on real footage, so this overrides
    Claude's map selection outright.

    Behaviour when ``map_hint`` is a known map:
      - force ``game_slug`` to that map's game and ``map_slug`` to ``map_hint``
      - if Claude returned a DIFFERENT map, emit a structured override code +
        human note (so the override is visible in telemetry, per
        check-third-party-error-codes). The returned zone slugs are KEPT:
        ``resolve_slugs`` scopes zone lookups to the (now-forced) map, so a slug
        that also exists on the hinted map (catwalk, b-site, …) resolves
        correctly, while one that does not (e.g. ancient-only ``a-main``)
        cleanly nulls out for the operator to set during review.

    Returns a COPY (never mutates ``parsed``), matching
    :func:`check_game_map_consistency`. A ``map_hint`` absent from the
    reference data is a no-op with a logged note (defensive — the source
    service validates the slug at write time).
    """
    map_game = {m["slug"]: m["game_slug"] for m in ref.get("maps", [])}
    if map_hint not in map_game:
        failures.append(
            f"map_hint '{map_hint}' not found in reference data — scope not applied"
        )
        return parsed
    result = dict(parsed)
    claude_map = result.get("map_slug")
    if claude_map and claude_map != map_hint:
        failures.append(
            f"MAP-SCOPE OVERRIDE: classifier chose map='{claude_map}' but source is "
            f"scoped to '{map_hint}' — forcing '{map_hint}' (zones re-resolved on it)"
        )
        if codes is not None:
            codes.append(f"map_hint_override:claude={claude_map}:forced={map_hint}")
    result["game_slug"] = map_game[map_hint]
    result["map_slug"] = map_hint
    return result
