"""Map Claude's ``record_item`` tool input to a validated ``ItemExtractionResponse``.

Tool-use input is shaped by our JSON schema but not guaranteed by it, so this is
the trust boundary: unknown stat keys, non-numeric or out-of-range values and a
malformed weapon block are dropped with a warning instead of reaching the UI,
and input that isn't an item tooltip at all is rejected.
"""
from __future__ import annotations

import math
from typing import Any

from pydantic import ValidationError

from app.schemas.wow.extracted_item import (
    ITEM_QUALITIES,
    ITEM_SLOTS,
    ExtractedItem,
    ExtractedWeapon,
    ItemExtractionResponse,
)
from app.services.wow.item_extraction_errors import (
    ItemExtractionUnreadableError,
    NotAnItemTooltipError,
)
from app.services.wow.stat_keys import MAX_ABS_STAT_VALUE, STAT_KEYS

_MAX_UNPARSED = 20
_MAX_EFFECT_CHARS = 300


def map_tool_input(raw: dict[str, Any]) -> ItemExtractionResponse:
    """Validate and normalize one ``record_item`` tool call.

    Raises:
        NotAnItemTooltipError: the model said the input isn't an item tooltip,
            or returned no item name.
        ItemExtractionUnreadableError: the payload can't be coerced into an item.
    """
    if raw.get("is_item_tooltip") is not True:
        raise NotAnItemTooltipError(
            "Input is not an item tooltip", error_type="not_an_item_tooltip"
        )

    name = _clean_str(raw.get("name"), 120)
    if not name:
        raise NotAnItemTooltipError("Tooltip has no item name", error_type="missing_name")

    warnings: list[str] = []
    unparsed = _clean_effects(raw.get("unparsed_effects"))
    stats = _clean_stats(raw.get("stats"), warnings, unparsed)
    weapon = _clean_weapon(raw.get("weapon"), warnings)

    try:
        item = ExtractedItem(
            name=name,
            quality=_enum_or_none(raw.get("quality"), ITEM_QUALITIES),
            slot=_enum_or_none(raw.get("slot"), ITEM_SLOTS),
            item_type=_clean_str(raw.get("item_type"), 40),
            armor=_int_in_range(raw.get("armor"), 0, 20000),
            weapon=weapon,
            stats=stats,
            unparsed_effects=unparsed[:_MAX_UNPARSED],
            required_level=_int_in_range(raw.get("required_level"), 1, 100),
            set_name=_clean_str(raw.get("set_name"), 120),
        )
    except ValidationError as exc:
        raise ItemExtractionUnreadableError(
            f"Item failed validation: {exc.error_count()} errors",
            error_type="invalid_item_payload",
        ) from exc

    if not item.stats and item.armor is None and item.weapon is None and not item.unparsed_effects:
        warnings.append("No stats were found on this item — check the tooltip and add any missing ones.")
    return ItemExtractionResponse(item=item, warnings=warnings)


def _clean_str(value: Any, max_len: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned[:max_len] or None


def _enum_or_none(value: Any, allowed: tuple[str, ...]) -> str | None:
    if isinstance(value, str) and value in allowed:
        return value
    return None


def _as_finite_number(value: Any) -> float | None:
    # bool is an int subclass — True must not become a stat of 1.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _int_in_range(value: Any, low: int, high: int) -> int | None:
    number = _as_finite_number(value)
    if number is None or not low <= number <= high:
        return None
    return int(round(number))


def _clean_effects(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    effects = (_clean_str(v, _MAX_EFFECT_CHARS) for v in value)
    return [e for e in effects if e]


def _clean_stats(value: Any, warnings: list[str], unparsed: list[str]) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    stats: dict[str, float] = {}
    for key, raw_number in value.items():
        number = _as_finite_number(raw_number)
        if key not in STAT_KEYS:
            # Keep what the tooltip said so the user can map it by hand.
            unparsed.append(f"{key}: {raw_number}"[:_MAX_EFFECT_CHARS])
            warnings.append(f"Unrecognized stat '{key}' was not scored.")
            continue
        if number is None or abs(number) > MAX_ABS_STAT_VALUE:
            warnings.append(f"Ignored an unreadable value for {key}.")
            continue
        if number != 0:
            stats[key] = number
    return stats


def _clean_weapon(value: Any, warnings: list[str]) -> ExtractedWeapon | None:
    if not isinstance(value, dict):
        return None
    low = _as_finite_number(value.get("min_damage"))
    high = _as_finite_number(value.get("max_damage"))
    speed = _as_finite_number(value.get("speed"))
    if low is None or high is None or speed is None or speed <= 0:
        warnings.append("Weapon damage or speed was unreadable — enter it by hand.")
        return None
    dps = _as_finite_number(value.get("dps"))
    if dps is None:
        dps = round((low + high) / 2 / speed, 1)
    try:
        return ExtractedWeapon(min_damage=low, max_damage=high, speed=speed, dps=dps)
    except ValidationError:
        warnings.append("Weapon damage or speed looked wrong — check it by hand.")
        return None
