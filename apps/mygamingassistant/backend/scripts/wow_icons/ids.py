"""Which items and spells the WoW pages show, and the client icon each one uses.

Pure functions over the generated data JSON and the client's DB2 rows, so the
selection is unit-tested without the network (``tests/test_wow_icons_generator.py``).
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

# SpellMisc has one row per difficulty; the plain row (0) is the one the game shows.
BASE_DIFFICULTY = "0"


@dataclass
class IconIds:
    """Item and spell ids a page names, so their icons go in the icon map."""

    items: set[int] = field(default_factory=set)
    spells: set[int] = field(default_factory=set)
    # Icon files a page names directly (the talent calculator's talents and trees).
    files: set[int] = field(default_factory=set)

    def update(self, other: "IconIds") -> None:
        self.items |= other.items
        self.spells |= other.spells
        self.files |= other.files


def _reagent_ids(reagents: Iterable[Mapping[str, Any]]) -> set[int]:
    return {int(r["id"]) for r in reagents}


def recipe_ids(recipe: Mapping[str, Any]) -> IconIds:
    """A recipe's created item, reagents, tool and teaching item. A recipe that makes
    nothing (an enchant) is shown with its spell's icon, so the spell joins too."""
    ids = IconIds(items=_reagent_ids(recipe.get("reagents", [])))
    creates = recipe.get("creates")
    if creates:
        ids.items.add(int(creates["id"]))
    else:
        ids.spells.add(int(recipe["spell"]))
    tool = recipe.get("tool")
    if tool:
        ids.items.add(int(tool["id"]))
    learn = recipe.get("learn", {})
    if learn.get("source") == "item":
        ids.items.add(int(learn["itemId"]))
    classic = recipe.get("classic") or {}
    ids.items |= _reagent_ids(classic.get("reagents", []))
    return ids


def crafting_file_ids(data: Mapping[str, Any]) -> IconIds:
    """Every item / spell a generated ``crafting/<profession>.json`` names."""
    ids = IconIds()
    for key in ("recipes", "smelting", "camp"):
        for recipe in data.get(key, []):
            ids.update(recipe_ids(recipe))
    ids.items |= {int(item_id) for item_id in data.get("madeBy", {})}
    for item_id, maker in data.get("makers", {}).items():
        ids.items.add(int(item_id))
        ids.items |= _reagent_ids(maker.get("reagents", []))
    return ids


def item_icons(
    wanted: Iterable[int],
    items: Iterable[Mapping[str, str]],
    sparse: Iterable[Mapping[str, str]],
    appearance_icons: Mapping[int, int],
) -> tuple[dict[int, tuple[int, int]], list[int]]:
    """``{item id: (icon file id, quality)}`` for the wanted items, and the ids with no icon.

    The icon is ``Item.IconFileDataID``, else the item's default appearance icon
    (``appearance_icons``, item id -> ``ItemAppearance.DefaultIconFileDataID``).
    Quality is ``ItemSparse.OverallQualityID`` (0 = poor ... 7 = heirloom).
    """
    wanted_set = set(wanted)
    icons: dict[int, int] = {}
    for row in items:
        item_id = int(row["ID"])
        if item_id in wanted_set:
            icon = int(row["IconFileDataID"] or 0) or appearance_icons.get(item_id, 0)
            if icon > 0:
                icons[item_id] = icon
    quality = {int(r["ID"]): int(r["OverallQualityID"] or 0) for r in sparse if int(r["ID"]) in wanted_set}
    found = {i: (icons[i], quality.get(i, 1)) for i in sorted(icons)}
    return found, sorted(wanted_set - found.keys())


def spell_icons(
    wanted: Iterable[int], spell_misc: Iterable[Mapping[str, str]]
) -> tuple[dict[int, int], list[int]]:
    """``{spell id: icon file id}`` from SpellMisc's base-difficulty rows, and the ids with no icon."""
    wanted_set = set(wanted)
    icons: dict[int, int] = {}
    for row in spell_misc:
        spell_id = int(row["SpellID"])
        icon = int(row["SpellIconFileDataID"] or 0)
        if spell_id in wanted_set and row["DifficultyID"] == BASE_DIFFICULTY and icon > 0:
            icons[spell_id] = icon
    return dict(sorted(icons.items())), sorted(wanted_set - icons.keys())


def skill_icons(
    wanted: Iterable[int], skill_lines: Iterable[Mapping[str, str]]
) -> tuple[dict[int, int], list[int]]:
    """``{skill line id: icon file id}`` from SkillLine (a profession's icon), and the ids with no icon."""
    wanted_set = set(wanted)
    icons = {
        int(row["ID"]): int(row["SpellIconFileID"] or 0)
        for row in skill_lines
        if int(row["ID"]) in wanted_set and int(row["SpellIconFileID"] or 0) > 0
    }
    return dict(sorted(icons.items())), sorted(wanted_set - icons.keys())


def appearance_icon_map(
    modified: Iterable[Mapping[str, str]], appearances: Iterable[Mapping[str, str]]
) -> dict[int, int]:
    """Item id -> its default appearance's icon (``ItemModifiedAppearance`` order 0 -> ``ItemAppearance``)."""
    icon_of = {int(a["ID"]): int(a["DefaultIconFileDataID"] or 0) for a in appearances}
    out: dict[int, int] = {}
    for row in modified:
        if row["OrderIndex"] != "0":
            continue
        icon = icon_of.get(int(row["ItemAppearanceID"]), 0)
        if icon > 0:
            out[int(row["ItemID"])] = icon
    return out


def talent_file_ids(talent_files: Iterable[Mapping[str, Any]]) -> set[int]:
    """The icon files a generated ``talents/<class>.json`` names: each tree's and each talent's."""
    files: set[int] = set()
    for doc in talent_files:
        for tree in doc["trees"]:
            files.add(int(tree["icon"]))
            files |= {int(t["icon"]) for t in tree["talents"]}
    files.discard(0)
    return files


def icon_file_ids(icon_map: Mapping[str, Any]) -> list[int]:
    """Every distinct icon file the map uses — what the publish step uploads."""
    files = {fdid for fdid, _quality in icon_map["items"].values()}
    files |= set(icon_map["spells"].values())
    files |= set(icon_map.get("files", []))
    files |= set(icon_map.get("skills", {}).values())
    return sorted(files)
