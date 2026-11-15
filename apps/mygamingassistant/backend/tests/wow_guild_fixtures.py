"""Shared WoW Forever guild test data: a guild, and a character fetch in it."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.character.character_mapper import to_character_response
from app.services.wow.character.character_profile import CharacterProfile

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)

# Sentinel: {} means "Blizzard answered, character has no points". Stored at module
# level to avoid the mutable-default-argument lint warning on make_fetch.
_NO_SPEC_POINTS: dict[str, Any] = {}
GUILD: dict[str, Any] = {
    "id": 230059, "name": "topdeadcenter", "slug": "topdeadcenter", "faction": {"type": "ALLIANCE", "name": "Alliance"},
}
OTHER_GUILD: dict[str, Any] = {**GUILD, "id": 999, "name": "Other Guild", "slug": "other-guild"}


def specializations_json(*trees: tuple[int, str, int]) -> dict[str, Any]:
    """Blizzard's /specializations answer for ``(tree_id, tree_name, spent_points)`` active-set entries."""
    return {"specialization_groups": [
        {"is_active": True, "specializations": [
            {"specialization": {"name": name, "id": tree_id}, "spent_points": points, "talents": []}
            for tree_id, name, points in trees
            if points > 0
        ]},
    ]}


def professions_json(*recipes: tuple[int, str]) -> dict[str, Any]:
    return {"primaries": [{"profession": {"name": "Tailoring", "id": 197}, "tiers": [
        {"skill_points": 148, "max_skill_points": 225,
         "known_recipes": [{"id": rid, "name": name} for rid, name in recipes]},
    ]}], "secondaries": []}


def reputations_json(*standings: tuple[int, str, int, int, int]) -> dict[str, Any]:
    """Blizzard's /reputations answer for ``(faction_id, faction_name, tier, value, max)`` standings."""
    return {"reputations": [
        {"faction": {"id": fid, "name": name}, "standing": {"tier": tier, "value": value, "max": cap, "name": "x"}}
        for fid, name, tier, value, cap in standings
    ]}


def profile_json(
    slug: str, blizzard_id: int, guild: dict[str, Any] | None, *, last_login_timestamp: int | None = None,
) -> dict[str, Any]:
    first, surname = (part.capitalize() for part in slug.split("-"))
    body: dict[str, Any] = {
        "id": blizzard_id, "name": first, "surname": surname, "level": 30,
        "race": {"name": "Gnome", "id": 7}, "character_class": {"name": "Warlock", "id": 9},
        "gender": {"type": "FEMALE", "name": "Female"}, "faction": {"type": "ALLIANCE", "name": "Alliance"},
    }
    if guild is not None:
        body["guild"] = guild
    if last_login_timestamp is not None:
        body["last_login_timestamp"] = last_login_timestamp
    return body


def make_fetch(
    slug: str = "jason-kwon", blizzard_id: int = 1, guild: dict[str, Any] | None = GUILD,
    professions: dict[str, Any] | None = None, reputations: dict[str, Any] | None = None,
    specializations: dict[str, Any] | None = _NO_SPEC_POINTS,
    last_login_timestamp: int | None = None,
) -> CharacterFetch:
    """``specializations=None`` = Blizzard's call failed (keep stored value); ``{}`` = no points yet."""
    profile = CharacterProfile(
        profile=profile_json(slug, blizzard_id, guild, last_login_timestamp=last_login_timestamp),
        media=None, equipment=None, statistics=None,
        specializations=specializations, professions=professions, reputations=reputations, pvp_summary=None,
        achievement_statistics=None, mounts={}, pets={},
    )
    return CharacterFetch(response=to_character_response(slug, profile), profile=profile, fresh=True)
