"""Shared WoW Forever guild test data: a guild, and a character fetch in it."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.character.character_mapper import to_character_response
from app.services.wow.character.character_profile import CharacterProfile

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)
GUILD: dict[str, Any] = {
    "id": 230059, "name": "topdeadcenter", "slug": "topdeadcenter", "faction": {"type": "ALLIANCE", "name": "Alliance"},
}
OTHER_GUILD: dict[str, Any] = {**GUILD, "id": 999, "name": "Other Guild", "slug": "other-guild"}


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


def profile_json(slug: str, blizzard_id: int, guild: dict[str, Any] | None) -> dict[str, Any]:
    first, surname = (part.capitalize() for part in slug.split("-"))
    body: dict[str, Any] = {
        "id": blizzard_id, "name": first, "surname": surname, "level": 30,
        "race": {"name": "Gnome", "id": 7}, "character_class": {"name": "Warlock", "id": 9},
        "gender": {"type": "FEMALE", "name": "Female"}, "faction": {"type": "ALLIANCE", "name": "Alliance"},
    }
    if guild is not None:
        body["guild"] = guild
    return body


def make_fetch(
    slug: str = "jason-kwon", blizzard_id: int = 1, guild: dict[str, Any] | None = GUILD,
    professions: dict[str, Any] | None = None, reputations: dict[str, Any] | None = None,
) -> CharacterFetch:
    profile = CharacterProfile(
        profile=profile_json(slug, blizzard_id, guild), media=None, equipment=None, statistics=None,
        specializations={}, professions=professions, reputations=reputations, pvp_summary=None,
        achievement_statistics=None, mounts={}, pets={},
    )
    return CharacterFetch(response=to_character_response(slug, profile), profile=profile, fresh=True)
