"""Blizzard's ``/professions`` answer → ``CharacterProfessions``.

A profession's ``tiers`` is one entry in Forever; if Blizzard ever sends
more, the highest skill is shown and the known recipes are merged.
"""
from __future__ import annotations

from typing import Any

from app.schemas.wow.character.character_profession import CharacterProfession
from app.schemas.wow.character.character_professions import CharacterProfessions
from app.schemas.wow.character.character_recipe import CharacterRecipe
from app.services.wow.character.character_json import as_dict, as_int, as_list, name_of


def _recipes(tiers: list[dict[str, Any]]) -> list[CharacterRecipe]:
    known: dict[int, CharacterRecipe] = {}
    for tier in tiers:
        for raw in as_list(tier.get("known_recipes")):
            recipe = as_dict(raw)
            recipe_id = as_int(recipe.get("id"))
            name = name_of(recipe)
            if recipe_id is not None and name is not None:
                known.setdefault(recipe_id, CharacterRecipe(id=recipe_id, name=name))
    return list(known.values())


def _profession(raw: Any) -> CharacterProfession | None:
    entry = as_dict(raw)
    profession = as_dict(entry.get("profession"))
    profession_id = as_int(profession.get("id"))
    name = name_of(profession)
    tiers = [as_dict(tier) for tier in as_list(entry.get("tiers"))]
    skills = [
        (skill, cap)
        for tier in tiers
        if (skill := as_int(tier.get("skill_points"))) is not None
        and (cap := as_int(tier.get("max_skill_points"))) is not None
    ]
    if profession_id is None or name is None or not skills:
        return None
    skill, max_skill = max(skills)
    return CharacterProfession(id=profession_id, name=name, skill=skill, max_skill=max_skill, recipes=_recipes(tiers))


def _list(raw: Any) -> list[CharacterProfession]:
    return [profession for entry in as_list(raw) if (profession := _profession(entry)) is not None]


def to_character_professions(professions: dict[str, Any] | None) -> CharacterProfessions | None:
    """None only when Blizzard failed to answer; a character with no professions has two empty lists."""
    if professions is None:
        return None
    return CharacterProfessions(
        primaries=_list(professions.get("primaries")), secondaries=_list(professions.get("secondaries")),
    )
