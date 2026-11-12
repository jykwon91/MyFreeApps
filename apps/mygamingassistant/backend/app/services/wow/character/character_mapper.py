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
from app.services.wow.character.character_profile import CharacterProfile

_DURABILITY = re.compile(r"(\d+)\s*/\s*(\d+)")


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _str(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _name(value: Any) -> str | None:
    return _str(_dict(value).get("name"))


def _display(value: Any) -> str | None:
    return _str(_dict(_dict(value).get("display")).get("display_string")) or _str(_dict(value).get("display_string"))


def render_url(media: dict[str, Any] | None) -> str | None:
    """The full-body render's URL from the character-media answer."""
    for asset in _list(_dict(media).get("assets")):
        if _dict(asset).get("key") == CHARACTER_RENDER_ASSET:
            return _str(asset.get("value"))
    return None


def _durability_low(text: str | None) -> bool:
    match = _DURABILITY.search(text or "")
    if match is None:
        return False
    current, maximum = int(match.group(1)), int(match.group(2))
    return maximum > 0 and current / maximum < CHARACTER_DURABILITY_LOW_SHARE


def _weapon(raw: Any) -> CharacterItemWeapon | None:
    weapon = _dict(raw)
    damage = _str(_dict(weapon.get("damage")).get("display_string"))
    if damage is None:
        return None
    return CharacterItemWeapon(
        damage=damage,
        speed=_str(_dict(weapon.get("attack_speed")).get("display_string")),
        dps=_str(_dict(weapon.get("dps")).get("display_string")),
    )


def _stats(raw: Any) -> list[CharacterItemStat]:
    stats: list[CharacterItemStat] = []
    for stat in _list(raw):
        text = _display(stat)
        if text is not None:
            stats.append(CharacterItemStat(text=text, equip_bonus=_dict(stat).get("is_equip_bonus") is True))
    return stats


def _requirements(raw: Any) -> list[str]:
    requirements = _dict(raw)
    lines = (_str(_dict(requirements.get(key)).get("display_string")) for key in ("level", "playable_classes"))
    return [line for line in lines if line]


def _item(raw: dict[str, Any]) -> CharacterItem | None:
    item_id = _int(_dict(raw.get("item")).get("id"))
    slot = _str(_dict(raw.get("slot")).get("type"))
    name = _str(raw.get("name"))
    if item_id is None or slot is None or name is None:
        return None
    inventory = _dict(raw.get("inventory_type"))
    durability = _str(_dict(raw.get("durability")).get("display_string"))
    return CharacterItem(
        slot=slot,
        item_id=item_id,
        name=name,
        quality=(_str(_dict(raw.get("quality")).get("type")) or "COMMON").lower(),
        item_level=_int(_dict(raw.get("level")).get("value")) or 0,
        inventory_type=_str(inventory.get("type")) or "",
        inventory_type_name=_str(inventory.get("name")) or "",
        subclass_name=None if raw.get("is_subclass_hidden") is True else _name(raw.get("item_subclass")),
        binding=_name(raw.get("binding")),
        armor=_display(raw.get("armor")),
        weapon=_weapon(raw.get("weapon")),
        stats=_stats(raw.get("stats")),
        enchantments=[t for t in (_str(_dict(e).get("display_string")) for e in _list(raw.get("enchantments"))) if t],
        spells=[t for t in (_str(_dict(s).get("description")) for s in _list(raw.get("spells"))) if t],
        set_name=_name(_dict(raw.get("set")).get("item_set")),
        requirements=_requirements(raw.get("requirements")),
        durability=durability,
        durability_low=_durability_low(durability),
        description=_str(raw.get("description")),
    )


def _last_login(raw: Any) -> datetime | None:
    millis = _int(raw)
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc) if millis else None


def to_character_response(slug: str, data: CharacterProfile) -> CharacterResponse:
    profile = data.profile
    character_class = _dict(profile.get("character_class"))
    items = [_item(raw) for raw in _list(_dict(data.equipment).get("equipped_items")) if isinstance(raw, dict)]
    return CharacterResponse(
        slug=slug,
        name=_str(profile.get("name")) or "",
        surname=_str(profile.get("surname")) or "",
        level=_int(profile.get("level")) or 0,
        race=_name(profile.get("race")) or "",
        class_id=_int(character_class.get("id")) or 0,
        class_name=_str(character_class.get("name")) or "",
        gender=_name(profile.get("gender")) or "",
        faction=(_str(_dict(profile.get("faction")).get("type")) or "").lower(),
        guild=_name(profile.get("guild")),
        ruleset=_name(profile.get("ruleset")),
        equipped_item_level=_int(profile.get("equipped_item_level")),
        last_login=_last_login(profile.get("last_login_timestamp")),
        has_render=render_url(data.media) is not None,
        items=[item for item in items if item is not None],
    )
