"""Prompt building blocks shared across the Claude classifier entrypoints.

Pure prompt-text assembly — no DB, no Anthropic SDK, no I/O. The two constants
are cached in the system prompt (they never change per call); ``build_reference_text``
shapes the loaded reference data into the reference block Claude reads.

Extracted from the former ``classifier_service.py`` (which had become a utility
grab-bag) so the shared prompt helpers have a cohesive home with PUBLIC names.
The classifier entrypoints — ``grid_classifier``, ``single_image_classifier``,
``stand_timing_classifier``, ``aim_timing_classifier``, ``throw_timing_classifier`` —
import from here.
"""
from __future__ import annotations

from typing import Any, Optional

# ---------------------------------------------------------------------------
# Visual game-identification cues (cached in system prompt — never changes)
#
# MAINTENANCE COUPLING: when a new game is added to the fixture data
# (app/fixtures/), this cue list MUST be extended with that game's
# distinguishing HUD/art-style signals and the NAME-COLLISION WARNING updated.
# A reference list that grows a third game without a matching visual-cue block
# reintroduces exactly the cross-game contamination this constant prevents.
# ---------------------------------------------------------------------------

GAME_VISUAL_CUES = """\
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

GAME_FIRST_RULE = """\
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


def build_reference_text(
    ref: dict[str, Any],
    game_hint: Optional[str] = None,
    map_hint: Optional[str] = None,
    agent_hint: Optional[str] = None,
) -> str:
    """Build the reference text block passed to Claude.

    Constant across calls for the same (game_hint, map_hint, agent_hint) → prime
    candidate for prompt caching. The reference data comes from
    :func:`app.repositories.game.reference_repo.load_reference_data`; this
    function shapes it into the system-prompt text Claude reads.

    ``map_hint`` is the operator's per-source map scope (Source.config_json
    ``map_hint``). When set, the map section is restricted to that single map
    and a HARD scope instruction is emitted, so Claude classifies zones using
    only that map's zone set. The map itself is additionally hard-locked
    post-parse by
    :func:`app.services.classification.scope_guards.apply_map_hint` — the prompt
    scope improves zone accuracy; the post-parse lock is the load-bearing
    correctness guarantee.

    ``agent_hint`` is the operator's per-source Valorant agent scope
    (Source.config_json ``agent_hint``). When set — and the agent owns at least
    one ability in the reference data — the utility-type candidate list is
    restricted to that agent's abilities and a HARD scope instruction is
    emitted. This is the recurrence fix for a Sova recon dart being tagged as
    another agent's smoke (e.g. Brimstone ``sky-smoke``): PR #950 grew the
    Valorant ability list from 4 to ~56 with no agent scoping, so the full menu
    invited cross-agent contamination. As with ``map_hint``, the utility is
    additionally hard-locked post-parse by
    :func:`app.services.classification.scope_guards.apply_agent_hint` — the
    prompt scope narrows the menu; the post-parse lock is the load-bearing
    guarantee (``resolve_slugs`` is game- but not agent-scoped, so a hallucinated
    off-agent slug would otherwise still resolve). An ``agent_hint`` with no
    matching abilities is ignored (no filter, no scope line) so the candidate
    list is never emptied.
    """
    lines: list[str] = []

    # Abilities owned by the hinted agent. Empty when agent_hint is unset OR the
    # hint matches no ability in the reference data (bad hint / agents not yet
    # loaded) — in which case the filter + scope line are skipped so the utility
    # menu is never emptied (defensive, mirroring apply_map_hint's no-op).
    agent_ability_slugs = {
        ut["slug"]
        for ut in ref.get("utility_types", [])
        if agent_hint and ut.get("agent_slug") == agent_hint
    }
    apply_agent_scope = bool(agent_ability_slugs)

    map_game = {m["slug"]: m["game_slug"] for m in ref.get("maps", [])}
    if map_hint:
        mg = map_game.get(map_hint)
        lines.append(
            f"SOURCE MAP SCOPE: every chapter in this source is on map "
            f"'{map_hint}'" + (f" (game '{mg}')" if mg else "") + "."
        )
        lines.append(
            f"You MUST set map_slug='{map_hint}' and pick target_zone_slug / "
            "stand_zone_slug ONLY from that map's zones listed below. Do NOT "
            "choose another map, regardless of chapter-title wording."
        )
        lines.append("")
    elif game_hint:
        lines.append(f"Expected game: {game_hint}")
        lines.append("")

    if apply_agent_scope:
        lines.append(
            f"SOURCE AGENT SCOPE: every chapter in this source is Valorant agent "
            f"'{agent_hint}'."
        )
        lines.append(
            f"You MUST pick utility_type_slug ONLY from {agent_hint}'s abilities "
            "listed below. Do NOT choose another agent's ability, no matter how "
            "similar the on-screen effect looks (e.g. a recon dart's scan is NOT "
            "a smoke)."
        )
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
        if map_hint and m["slug"] != map_hint:
            continue
        zone_slugs = ", ".join(z["slug"] for z in m["zones"]) if m["zones"] else "(no zones)"
        lines.append(f"  {m['slug']} [{m['game_slug']}]: {zone_slugs}")

    lines.append("")
    lines.append("Valid utility types (slug → name, game):")
    for ut in ref["utility_types"]:
        # When agent-scoped, list ONLY the hinted agent's abilities. Off-agent
        # utilities (other agents, and CS2's agent-less grenades) are dropped —
        # an agent_hint is always a Valorant/agent source, so they're never
        # valid candidates here.
        if apply_agent_scope and ut.get("agent_slug") != agent_hint:
            continue
        lines.append(f"  {ut['slug']} [{ut['game_slug']}] → {ut['name']}")

    return "\n".join(lines)
