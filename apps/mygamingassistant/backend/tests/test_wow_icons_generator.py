"""The WoW icon map generator: which ids get an icon, which icon, and what gets published.

Fixtures only — no network. A failing committed-file check means the map and the
Professions data drifted: re-run ``python -m scripts.wow_icons.build``.
"""
from __future__ import annotations

import io
import json
import struct
from pathlib import Path

import pytest
from PIL import Image

from scripts.wow_icons.build import OUT_FILE, cooking_item_ids, gathering_item_ids, wanted_ids, write_icon_map
from scripts.wow_icons.ids import (
    IconIds,
    appearance_icon_map,
    crafting_file_ids,
    icon_file_ids,
    item_icons,
    recipe_ids,
    spell_icons,
)
from scripts.wow_icons.images import ICON_SIZE, blp_to_webp, icon_key
from scripts.wow_icons.publish import publish


def _recipe(**extra: object) -> dict[str, object]:
    base: dict[str, object] = {
        "spell": 2657,
        "name": "Smelt Copper",
        "reagents": [{"id": 2770, "name": "Copper Ore", "count": 1}],
        "learn": {"source": "start", "skill": 1},
    }
    base.update(extra)
    return base


def test_recipe_that_makes_an_item_uses_the_item_not_the_spell() -> None:
    ids = recipe_ids(_recipe(creates={"id": 2840, "name": "Copper Bar", "count": 1, "quality": 1}))
    assert ids.items == {2770, 2840}
    assert ids.spells == set()


def test_enchant_uses_its_spell_icon() -> None:
    ids = recipe_ids(_recipe(spell=7418, enchant=True))
    assert ids.spells == {7418}


def test_tool_teaching_item_and_classic_reagents_join() -> None:
    ids = recipe_ids(
        _recipe(
            creates={"id": 1, "name": "x", "count": 1, "quality": 1},
            tool={"id": 6218, "name": "Runed Copper Rod"},
            learn={"source": "item", "skill": 50, "itemId": 6342, "item": "Formula"},
            classic={"yellow": 1, "grey": 2, "reagents": [{"id": 10940, "name": "Strange Dust", "count": 1}]},
        )
    )
    assert {6218, 6342, 10940} <= ids.items


def test_crafting_file_collects_recipes_smelts_camp_made_by_and_makers() -> None:
    data = {
        "recipes": [_recipe(creates={"id": 2840, "name": "Copper Bar", "count": 1, "quality": 1})],
        "smelting": [_recipe(spell=3304, reagents=[{"id": 2771, "name": "Tin Ore", "count": 1}], creates={"id": 3576, "name": "Tin Bar", "count": 1, "quality": 1})],
        "camp": [_recipe(spell=9, reagents=[{"id": 2835, "name": "Rough Stone", "count": 1}], creates={"id": 279960, "name": "Lodestone", "count": 1, "quality": 1})],
        "madeBy": {"2996": "Tailoring"},
        "makers": {"2996": {"count": 1, "reagents": [{"id": 2589, "name": "Linen Cloth", "count": 2}]}},
    }
    assert crafting_file_ids(data).items == {2770, 2840, 2771, 3576, 2835, 279960, 2996, 2589}


def test_item_icon_falls_back_to_the_appearance_and_reports_missing() -> None:
    items = [
        {"ID": "2840", "IconFileDataID": "133217"},
        {"ID": "5", "IconFileDataID": "0"},
        {"ID": "6", "IconFileDataID": "0"},
        {"ID": "7", "IconFileDataID": "555"},  # not wanted
    ]
    sparse = [{"ID": "2840", "OverallQualityID": "1"}, {"ID": "5", "OverallQualityID": "3"}]
    found, missing = item_icons({2840, 5, 6}, items, sparse, {5: 999})
    assert found == {2840: (133217, 1), 5: (999, 3)}
    assert missing == [6]


def test_spell_icon_uses_the_base_difficulty_row() -> None:
    rows = [
        {"SpellID": "7418", "DifficultyID": "1", "SpellIconFileDataID": "1"},
        {"SpellID": "7418", "DifficultyID": "0", "SpellIconFileDataID": "135913"},
        {"SpellID": "8", "DifficultyID": "0", "SpellIconFileDataID": "0"},
    ]
    found, missing = spell_icons({7418, 8}, rows)
    assert found == {7418: 135913}
    assert missing == [8]


def test_appearance_map_uses_order_zero() -> None:
    modified = [
        {"ItemID": "5", "ItemAppearanceID": "10", "OrderIndex": "0"},
        {"ItemID": "5", "ItemAppearanceID": "11", "OrderIndex": "1"},
    ]
    appearances = [{"ID": "10", "DefaultIconFileDataID": "999"}, {"ID": "11", "DefaultIconFileDataID": "1"}]
    assert appearance_icon_map(modified, appearances) == {5: 999}


def test_distinct_icon_files_cover_items_and_spells() -> None:
    icon_map = {"items": {"1": [10, 1], "2": [10, 2], "3": [11, 1]}, "spells": {"9": 12, "8": 10}}
    assert icon_file_ids(icon_map) == [10, 11, 12]


def test_gathering_nodes_are_read_from_the_guides(tmp_path: Path) -> None:
    (tmp_path / "herbs.ts").write_text('{ name: "Peacebloom", itemId: 2447, node: "Peacebloom" },\n', encoding="utf-8")
    (tmp_path / "ore.ts").write_text("{ itemId:2770 }", encoding="utf-8")
    assert gathering_item_ids(tmp_path) == {2447, 2770}


def test_cooking_ingredients_are_read_from_the_guide(tmp_path: Path) -> None:
    path = tmp_path / "cooking.ts"
    path.write_text(
        'mats: [{ id: 2672, name: "Stringy Wolf Meat" }, { id: 769, name: "Chunk of Boar Meat" }],\n'
        '{ id: "train", title: "Train Cooking" },\n',
        encoding="utf-8",
    )
    assert cooking_item_ids(path) == {2672, 769}


def test_map_file_puts_one_id_per_line_and_stays_json(tmp_path: Path) -> None:
    payload = {"source": "s", "build": "1.2.3.4", "items": {"1": [10, 1], "2": [11, 2]}, "spells": {"3": 12, "4": 13}}
    path = tmp_path / "m.json"
    write_icon_map(path, payload)
    text = path.read_text(encoding="utf-8")
    assert json.loads(text) == payload
    assert '\n"2":[11,2]' in text and '\n"4":13' in text


def test_blp_is_scaled_to_a_64px_webp() -> None:
    # Pillow can't write BLP, but the converter only needs an image Pillow opens.
    source = io.BytesIO()
    Image.new("RGBA", (128, 128), (200, 10, 10, 255)).save(source, "PNG")
    webp = Image.open(io.BytesIO(blp_to_webp(source.getvalue())))
    assert webp.format == "WEBP"
    assert webp.size == (ICON_SIZE, ICON_SIZE)


def test_raw_bgra_blp_pillow_cannot_read_is_decoded() -> None:
    # BLP2 encoding 3 (seen on icon 4559256): header, 256-colour palette, then BGRA pixels.
    width = height = 4
    pixels = bytes([10, 20, 200, 255]) * (width * height)  # B, G, R, A
    offset = 148 + 1024
    mips = struct.pack("<16I", offset, *[0] * 15) + struct.pack("<16I", len(pixels), *[0] * 15)
    header = b"BLP2" + struct.pack("<I", 1) + bytes([3, 8, 8, 0]) + struct.pack("<II", width, height) + mips
    blp = header + bytes(1024) + pixels
    webp = Image.open(io.BytesIO(blp_to_webp(blp))).convert("RGBA")
    assert webp.size == (width, height)
    red, green, blue, alpha = webp.getpixel((1, 1))
    # WebP is lossy, so allow a little drift — but the channel order must be right.
    assert abs(red - 200) < 12 and abs(green - 20) < 12 and abs(blue - 10) < 12
    assert alpha == 255


class _FakeBucket:
    def __init__(self, present: set[str]) -> None:
        self.present = present
        self.puts: dict[str, bytes] = {}

    def exists(self, key: str) -> bool:
        return key in self.present

    def put(self, key: str, body: bytes) -> None:
        self.puts[key] = body


def test_publish_skips_icons_already_in_the_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    png = io.BytesIO()
    Image.new("RGBA", (64, 64)).save(png, "PNG")
    monkeypatch.setattr("scripts.wow_icons.publish.client_file", lambda _fdid: png.getvalue())
    bucket = _FakeBucket({icon_key("1.2.3.4", 10)})
    counts = publish("1.2.3.4", [10, 11], bucket)
    assert counts["present"] == 1 and counts["uploaded"] == 1
    assert list(bucket.puts) == ["wow/1.2.3.4/icons/11.webp"]


def test_dry_run_uploads_nothing() -> None:
    assert publish("1.2.3.4", [10, 11], None)["would-upload"] == 2


def test_committed_map_covers_every_id_the_pages_name() -> None:
    icon_map = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    wanted: IconIds = wanted_ids()
    assert wanted.items <= {int(k) for k in icon_map["items"]}
    assert wanted.spells <= {int(k) for k in icon_map["spells"]}
    assert icon_map["build"] in icon_map["source"]
