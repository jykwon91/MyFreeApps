"""The Auction house item categories generator: filing items by class and subclass (no network)."""
from __future__ import annotations

import json

from scripts.wow_items.categories import (
    GEAR_KEY,
    build_categories,
    item_key,
    render,
    usable_subclass_names,
)

NAMES = {
    (0, 1): "Potions",
    (0, 2): "Elixirs",
    (0, 9): "Consumable (OBSOLETE)",
    (7, 9): "Herb",
    (7, 5): "Cloth",
    (7, 99): "",
    (12, 0): "Quest",
    (13, 0): "Key",
    (2, 7): "Swords",
    (4, 1): "Cloth",
    (15, 0): "Junk",
}


def _item(class_id: int, subclass_id: int) -> dict[str, str]:
    return {"ClassID": str(class_id), "SubclassID": str(subclass_id)}


ROWS = {
    13446: _item(0, 1),  # Major Healing Potion
    13445: _item(0, 2),
    2447: _item(7, 9),  # Peacebloom
    2589: _item(7, 5),  # Linen Cloth
    1: _item(0, 9),  # obsolete subclass
    2: _item(7, 99),  # unnamed subclass
    3: _item(12, 0),  # quest
    4: _item(13, 0),  # key
    5: _item(2, 7),  # a sword
    6: _item(4, 1),  # a cloth armor piece
    7: _item(15, 0),
    8: _item(3, 0),  # gems: not a category the page offers
}


def test_usable_subclass_names_keep_only_offered_current_named_subclasses() -> None:
    assert usable_subclass_names(NAMES) == {
        (0, 1): "Potions",
        (0, 2): "Elixirs",
        (7, 9): "Herb",
        (7, 5): "Cloth",
        (15, 0): "Junk",
    }


def test_item_key_files_weapons_and_armor_under_gear() -> None:
    names = usable_subclass_names(NAMES)
    assert item_key(ROWS[5], names) == GEAR_KEY
    assert item_key(ROWS[6], names) == GEAR_KEY


def test_item_key_uses_class_dot_subclass_and_skips_everything_else() -> None:
    names = usable_subclass_names(NAMES)
    assert item_key(ROWS[13446], names) == "0.1"
    assert item_key(ROWS[1], names) is None
    assert item_key(ROWS[2], names) is None
    assert item_key(ROWS[3], names) is None
    assert item_key(ROWS[4], names) is None
    assert item_key(ROWS[8], names) is None


def test_build_categories_sorts_ids_and_keys_and_names_only_subclasses_with_items() -> None:
    result = build_categories(ROWS, [13446, 2589, 2447, 13445, 5, 6, 7, 1, 2, 3, 4, 8], NAMES)
    assert result["items"] == {
        "0.1": [13446],
        "0.2": [13445],
        "7.5": [2589],
        "7.9": [2447],
        "15.0": [7],
        GEAR_KEY: [5, 6],
    }
    assert list(result["items"]) == ["0.1", "0.2", "7.5", "7.9", "15.0", GEAR_KEY]
    assert result["subclasses"] == {"0.1": "Potions", "0.2": "Elixirs", "7.5": "Cloth", "7.9": "Herb", "15.0": "Junk"}


def test_build_categories_drops_a_subclass_nobody_is_in() -> None:
    result = build_categories(ROWS, [13446], NAMES)
    assert result["subclasses"] == {"0.1": "Potions"}


def test_build_categories_skips_ids_without_a_client_row_and_ignores_duplicates() -> None:
    result = build_categories(ROWS, [13446, 13446, 999999], NAMES)
    assert result["items"] == {"0.1": [13446]}


def test_render_is_valid_json_with_one_category_per_line() -> None:
    header = {"source": "s", "clientBuild": "1.2.3", "attribution": "a"}
    text = render(header, build_categories(ROWS, [13446, 13445, 5], NAMES))
    document = json.loads(text)
    assert document["clientBuild"] == "1.2.3"
    assert document["subclasses"] == {"0.1": "Potions", "0.2": "Elixirs"}
    assert document["items"] == {"0.1": [13446], "0.2": [13445], GEAR_KEY: [5]}
    assert '"0.1":[13446],\n"0.2":[13445]' in text
    assert text.endswith("}\n")
