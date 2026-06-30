"""Conformance tests for the Valorant agent fixtures.

Pure-JSON checks (no DB) guarding the invariants the agent-filter feature
depends on:
  - the roster is the full 29-agent Valorant set with valid roles;
  - every Valorant ability's ``agent_slug`` resolves to a seeded agent;
  - Valorant ability slugs are globally unique (the utility_type (game_id, slug)
    unique constraint was intentionally NOT relaxed — it relies on this);
  - Sova's ``recon`` / ``shock`` slugs are preserved (prod lineups reference them);
  - the pruned generic Valorant utilities are gone from the fixture.
"""
import json
from pathlib import Path

_FIXTURES = Path(__file__).resolve().parents[1] / "app" / "fixtures"
_VALID_ROLES = {"Duelist", "Initiator", "Controller", "Sentinel"}


def _load(name: str):
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def _valorant_block(fixture: list[dict], key: str) -> list[dict]:
    for entry in fixture:
        if entry["game_slug"] == "valorant":
            return entry[key]
    raise AssertionError(f"no valorant block with key {key!r}")


def _agents() -> list[dict]:
    return _valorant_block(_load("agents.json"), "agents")


def _valorant_utils() -> list[dict]:
    return _valorant_block(_load("utility_types.json"), "utility_types")


def test_roster_is_full_29_with_valid_roles():
    agents = _agents()
    assert len(agents) == 29, f"expected 29 Valorant agents, got {len(agents)}"
    for a in agents:
        assert a["role"] in _VALID_ROLES, f"agent {a['slug']} has invalid role {a['role']!r}"


def test_agent_slugs_unique_and_sova_present():
    slugs = [a["slug"] for a in _agents()]
    assert len(slugs) == len(set(slugs)), "duplicate agent slug(s)"
    assert "sova" in slugs


def test_every_ability_agent_slug_resolves():
    agent_slugs = {a["slug"] for a in _agents()}
    for ut in _valorant_utils():
        assert "agent_slug" in ut, f"valorant utility {ut['slug']} missing agent_slug"
        assert ut["agent_slug"] in agent_slugs, (
            f"utility {ut['slug']} references unknown agent {ut['agent_slug']!r}"
        )


def test_ability_slugs_globally_unique_within_valorant():
    slugs = [ut["slug"] for ut in _valorant_utils()]
    dupes = {s for s in slugs if slugs.count(s) > 1}
    assert not dupes, f"duplicate Valorant ability slug(s) break the unique constraint: {dupes}"


def test_sova_recon_and_shock_preserved():
    by_slug = {ut["slug"]: ut for ut in _valorant_utils()}
    assert by_slug.get("recon", {}).get("agent_slug") == "sova"
    assert by_slug.get("shock", {}).get("agent_slug") == "sova"


def test_generic_valorant_utilities_pruned():
    slugs = {ut["slug"] for ut in _valorant_utils()}
    assert slugs.isdisjoint({"smoke", "flash", "molotov"}), (
        "generic Valorant smoke/flash/molotov must be removed (replaced by agent abilities)"
    )
