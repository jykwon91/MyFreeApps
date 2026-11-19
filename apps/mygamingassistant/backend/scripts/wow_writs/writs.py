"""Pure steps of the writs build: which writs exist, what each asks for, where it goes."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

WRIT_PREFIX = "Craftsman's Writ: "
TIERS = ("journeyman", "expert", "artisan")
FACTIONS = ("alliance", "horde")
# Teaching items name the craft after one of these.
RECIPE_PREFIXES = ("Recipe: ", "Plans: ", "Schematic: ", "Formula: ", "Pattern: ", "Manual: ")
# Two recordings this close (map percent) are the same spot.
SAME_SPOT = 1.0


def writ_items(item_names: Mapping[str, str]) -> list[tuple[int, str]]:
    """Every "Craftsman's Writ: X" item the client knows, by id."""
    return sorted((int(i), n) for i, n in item_names.items() if n.startswith(WRIT_PREFIX))


def product_index(crafting: Iterable[Mapping[str, Any]]) -> dict[str, set[tuple[int, str]]]:
    """Lower-cased craft name → the item(s) it makes.

    A writ names its item the way the craft is named, which can differ from the
    item ("Elixir of Ogre's Strength" makes "Elixir of Ogre Strength"), so the
    recipe's name, its teaching item's name and the made item's name all count.
    """
    index: dict[str, set[tuple[int, str]]] = {}
    for profession in crafting:
        for recipe in profession.get("recipes", []):
            made = recipe.get("creates") or {}
            if not made.get("id"):
                continue
            names = {recipe.get("name"), made.get("name")}
            teacher = (recipe.get("learn") or {}).get("item") or ""
            for prefix in RECIPE_PREFIXES:
                if teacher.startswith(prefix):
                    names.add(teacher[len(prefix):])
            for name in filter(None, names):
                index.setdefault(name.lower(), set()).add((int(made["id"]), str(made["name"])))
    return index


def product_for(product_name: str, index: Mapping[str, set[tuple[int, str]]]) -> dict[str, Any] | None:
    """The one item a writ asks for; None when no craft, or several different items, match."""
    found = index.get(product_name.lower(), set())
    if len(found) != 1:
        return None
    item_id, name = next(iter(found))
    return {"id": item_id, "name": name}


def writ_tier(item: Mapping[str, Any]) -> str:
    """Journeyman / Expert / Artisan, from the line under the writ's name."""
    label = (((item.get("preview_item") or {}).get("name_description") or {}).get("display_string") or "").lower()
    if label not in TIERS:
        raise SystemExit(f"writ {item.get('id')}: unknown tier {label!r} (expected one of {', '.join(TIERS)})")
    return label


def writ_quest(item: Mapping[str, Any]) -> int:
    quest = (((item.get("preview_item") or {}).get("item_starts_quest") or {}).get("quest") or {}).get("id")
    if not isinstance(quest, int):
        raise SystemExit(f"writ {item.get('id')}: it starts no quest")
    return quest


def _spot(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    try:
        spot = {
            "zone": str(raw["zone"]),
            "map": int(raw["map"]),
            "x": round(float(raw["x"]), 1),
            "y": round(float(raw["y"]), 1),
            "seen": str(raw["seen"]),
            "faction": str(raw["faction"]).lower(),
        }
    except (KeyError, TypeError, ValueError):
        return None
    if not spot["zone"] or spot["faction"] not in FACTIONS or not (0 <= spot["x"] <= 100 and 0 <= spot["y"] <= 100):
        return None
    return spot


def recorded_turn_ins(saved: Mapping[str, Any]) -> dict[int, list[dict[str, Any]]]:
    """``MGADungeonQuestsSettings.writSpots``: quest id → the spots seen in game."""
    settings = saved.get("MGADungeonQuestsSettings")
    spots = settings.get("writSpots") if isinstance(settings, Mapping) else None
    out: dict[int, list[dict[str, Any]]] = {}
    if not isinstance(spots, Mapping):
        return out
    for quest, seen in spots.items():
        rows = seen if isinstance(seen, list) else []
        good = [s for s in (_spot(r) for r in rows) if s]
        if isinstance(quest, int) and good:
            out[quest] = good
    return out


def merge_turn_ins(*sources: Mapping[int, list[dict[str, Any]]]) -> dict[int, list[dict[str, Any]]]:
    """Every spot from every source: one per place and faction, keeping the latest sighting."""
    merged: dict[int, list[dict[str, Any]]] = {}
    for source in sources:
        for quest, spots in source.items():
            kept = merged.setdefault(quest, [])
            for spot in spots:
                same = next(
                    (
                        k for k in kept
                        if k["map"] == spot["map"] and k["faction"] == spot["faction"]
                        and abs(k["x"] - spot["x"]) <= SAME_SPOT and abs(k["y"] - spot["y"]) <= SAME_SPOT
                    ),
                    None,
                )
                if same is None:
                    kept.append(dict(spot))
                elif spot["seen"] > same["seen"]:
                    same.update(spot)
    return {q: sorted(s, key=lambda k: (k["faction"], k["zone"], k["x"], k["y"])) for q, s in sorted(merged.items())}
