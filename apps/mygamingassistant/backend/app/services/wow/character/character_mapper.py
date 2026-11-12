"""Blizzard's profile + media + equipment answers → ``CharacterResponse``.

Only what a Classic character pane shows is kept; retail leftovers
(achievement points, keystone profile, remix flags, item context) are dropped.
Blizzard's ``display_string``s are the game's own tooltip text, so they are
passed through rather than rebuilt.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.core.wow_character import CHARACTER_DURABILITY_LOW_SHARE, CHARACTER_RENDER_ASSET
from app.schemas.wow.character.character_item import CharacterItem
from app.schemas.wow.character.character_item_stat import CharacterItemStat
from app.schemas.wow.character.character_item_weapon import CharacterItemWeapon
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character.character_collections_mapper import to_character_collections
from app.services.wow.character.character_json import as_dict, as_int, as_list, as_str, name_of
from app.services.wow.character.character_profile import CharacterProfile
from app.services.wow.character.character_stats_mapper import to_character_stats
from app.services.wow.character.character_professions_mapper import to_character_professions
from app.services.wow.character.character_pvp_mapper import to_character_pvp
from app.services.wow.character.character_reputations_mapper import to_character_reputations
from app.services.wow.character.character_talents_mapper import to_character_talents

_DURABILITY = re.compile(r"(\d+)\s*/\s*(\d+)")


def _display(value: Any) -> str | None:
    return as_str(as_dict(as_dict(value).get("display")).get("display_string")) or as_str(as_dict(value).get("display_string"))


def render_url(media: dict[str, Any] | None) -> str | None:
    """The full-body render's URL from the character-media answer."""
    for asset in as_list(as_dict(media).get("assets")):
        if as_dict(asset).get("key") == CHARACTER_RENDER_ASSET:
            return as_str(asset.get("value"))
    return None


def _durability_low(text: str | None) -> bool:
    match = _DURABILITY.search(text or "")
    if match is None:
        return False
    current, maximum = int(match.group(1)), int(match.group(2))
    return maximum > 0 and current / maximum < CHARACTER_DURABILITY_LOW_SHARE


def _weapon(raw: Any) -> CharacterItemWeapon | None:
    weapon = as_dict(raw)
    damage = as_str(as_dict(weapon.get("damage")).get("display_string"))
    if damage is None:
        return None
    return CharacterItemWeapon(
        damage=damage,
        speed=as_str(as_dict(weapon.get("attack_speed")).get("display_string")),
        dps=as_str(as_dict(weapon.get("dps")).get("display_string")),
    )


def _stats(raw: Any) -> list[CharacterItemStat]:
    stats: list[CharacterItemStat] = []
    for stat in as_list(raw):
        text = _display(stat)
        if text is not None:
            stats.append(CharacterItemStat(text=text, equip_bonus=as_dict(stat).get("is_equip_bonus") is True))
    return stats


def _requirements(raw: Any) -> list[str]:
    requirements = as_dict(raw)
    lines = (as_str(as_dict(requirements.get(key)).get("display_string")) for key in ("level", "playable_classes"))
    return [line for line in lines if line]


def _item(raw: dict[str, Any]) -> CharacterItem | None:
    item_id = as_int(as_dict(raw.get("item")).get("id"))
    slot = as_str(as_dict(raw.get("slot")).get("type"))
    name = as_str(raw.get("name"))
    if item_id is None or slot is None or name is None:
        return None
    inventory = as_dict(raw.get("inventory_type"))
    durability = as_str(as_dict(raw.get("durability")).get("display_string"))
    return CharacterItem(
        slot=slot,
        item_id=item_id,
        name=name,
        quality=(as_str(as_dict(raw.get("quality")).get("type")) or "COMMON").lower(),
        item_level=as_int(as_dict(raw.get("level")).get("value")) or 0,
        inventory_type=as_str(inventory.get("type")) or "",
        inventory_type_name=as_str(inventory.get("name")) or "",
        subclass_name=None if raw.get("is_subclass_hidden") is True else name_of(raw.get("item_subclass")),
        binding=name_of(raw.get("binding")),
        armor=_display(raw.get("armor")),
        weapon=_weapon(raw.get("weapon")),
        stats=_stats(raw.get("stats")),
        enchantments=[t for t in (as_str(as_dict(e).get("display_string")) for e in as_list(raw.get("enchantments"))) if t],
        spells=[t for t in (as_str(as_dict(s).get("description")) for s in as_list(raw.get("spells"))) if t],
        set_name=name_of(as_dict(raw.get("set")).get("item_set")),
        requirements=_requirements(raw.get("requirements")),
        durability=durability,
        durability_low=_durability_low(durability),
        description=as_str(raw.get("description")),
    )


def _last_login(raw: Any) -> datetime | None:
    millis = as_int(raw)
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc) if millis else None


def to_character_response(slug: str, data: CharacterProfile) -> CharacterResponse:
    profile = data.profile
    character_class = as_dict(profile.get("character_class"))
    items = [_item(raw) for raw in as_list(as_dict(data.equipment).get("equipped_items")) if isinstance(raw, dict)]
    return CharacterResponse(
        slug=slug,
        name=as_str(profile.get("name")) or "",
        surname=as_str(profile.get("surname")) or "",
        level=as_int(profile.get("level")) or 0,
        race=name_of(profile.get("race")) or "",
        class_id=as_int(character_class.get("id")) or 0,
        class_name=as_str(character_class.get("name")) or "",
        gender=name_of(profile.get("gender")) or "",
        faction=(as_str(as_dict(profile.get("faction")).get("type")) or "").lower(),
        guild=name_of(profile.get("guild")),
        ruleset=name_of(profile.get("ruleset")),
        equipped_item_level=as_int(profile.get("equipped_item_level")),
        last_login=_last_login(profile.get("last_login_timestamp")),
        has_render=render_url(data.media) is not None,
        items=[item for item in items if item is not None],
        stats=to_character_stats(data.statistics, data.equipment),
        talents=to_character_talents(data.specializations),
        professions=to_character_professions(data.professions),
        reputations=to_character_reputations(data.reputations),
        pvp=to_character_pvp(data.pvp_summary, data.achievement_statistics),
        collections=to_character_collections(data.mounts, data.pets),
    )
