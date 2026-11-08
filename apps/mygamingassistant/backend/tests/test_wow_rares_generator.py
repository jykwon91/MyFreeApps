"""The rares finder's generator (``scripts/wow_rares``) and its committed output."""
from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

import pytest
from scripts.wow_rares.build import RARES_PATH, SPAWNS_PATH
from scripts.wow_rares.creature_cache import (
    CLASSIFICATION_ELITE,
    CLASSIFICATION_NORMAL,
    CLASSIFICATION_RARE,
    CLASSIFICATION_RARE_ELITE,
    CachedCreature,
    CreatureCache,
    CreatureCacheError,
    parse_creature_cache,
)
from scripts.wow_rares.rares import (
    NOTABLE_DROP_CHANCE,
    classic_rares,
    event_only_guids,
    forever_rares,
    notable_drops,
    rare_spawns,
    zone_names,
)
from scripts.wow_world_map.services import SAME_SPOT_YARDS

# --- the creature cache -----------------------------------------------------


def _pack_bits(fields: list[tuple[int, int]], size: int) -> bytes:
    value = 0
    used = 0
    for number, width in fields:
        value = (value << width) | number
        used += width
    value <<= size * 8 - used
    return value.to_bytes(size, "big")


def _record(name: str, classification: int, alt_name: str = "") -> bytes:
    names = [name.encode() + b"\0", alt_name.encode() + b"\0" if alt_name else b""] + [b""] * 6
    header = _pack_bits([(0, 11), (0, 11), (0, 6), (0, 1)] + [(len(n), 11) for n in names], 15)
    fixed = bytes(17) + bytes([classification]) + bytes(20)
    return header + b"".join(names) + fixed


def _cache(records: list[tuple[int, bytes]], build: int = 70862) -> bytes:
    out = struct.pack("<4sI4sIII", b"BOMW", build, b"SUne", 0, 0, 0)
    for creature_id, body in records:
        out += struct.pack("<II", creature_id, len(body)) + body
    return out + struct.pack("<II", 0, 0)


def test_parses_names_and_classification() -> None:
    cache = parse_creature_cache(_cache([
        (99, _record("Morgaine the Sly", CLASSIFICATION_RARE)),
        (5797, _record("Aean Swiftriver", CLASSIFICATION_RARE_ELITE, alt_name="Aean")),
        (6, _record("Kobold Vermin", CLASSIFICATION_NORMAL)),
    ]))
    assert cache.build == 70862
    assert cache.creatures[99] == CachedCreature(99, "Morgaine the Sly", CLASSIFICATION_RARE)
    # The alternate name sits before the fixed fields, so it moves the classification byte.
    assert cache.creatures[5797].classification == CLASSIFICATION_RARE_ELITE
    assert cache.creatures[6].classification == CLASSIFICATION_NORMAL


def test_rejects_a_file_that_is_not_a_creature_cache() -> None:
    with pytest.raises(CreatureCacheError):
        parse_creature_cache(b"XXXX" + bytes(40))


def test_rejects_a_record_cut_short() -> None:
    blob = _cache([(99, _record("Morgaine the Sly", CLASSIFICATION_RARE))])
    with pytest.raises(CreatureCacheError):
        parse_creature_cache(blob[:40])


# --- choosing rares, spots and drops ----------------------------------------


def _creature(cid: int, name: str, classification: int) -> CachedCreature:
    return CachedCreature(cid, name, classification)


def test_only_rares_and_rare_elites_by_name() -> None:
    cache = CreatureCache(1, {
        1: _creature(1, "Zed", CLASSIFICATION_RARE),
        2: _creature(2, "Abe", CLASSIFICATION_RARE_ELITE),
        3: _creature(3, "Guard", CLASSIFICATION_ELITE),
        4: _creature(4, "Rat", CLASSIFICATION_NORMAL),
    })
    assert [c.creature_id for c in forever_rares(cache)] == [2, 1]


def _spawn(guid: int, creature: int, x: float, y: float, map_id: int = 0) -> dict[str, Any]:
    return {"guid": guid, "id": creature, "map": map_id, "position_x": x, "position_y": y}


def _placer(continent: int, wx: float, wy: float) -> list[Any] | None:
    if wx < 0:
        return None
    return [1429 + continent, "Somewhere", round(wx / 10, 1), round(wy / 10, 1)]


def test_spawns_skip_events_instances_far_off_and_merge_close_spots() -> None:
    rows = [
        _spawn(1, 99, 100.0, 100.0),
        _spawn(2, 99, 100.0 + SAME_SPOT_YARDS / 2, 100.0),  # same spot
        _spawn(3, 99, 500.0, 500.0),
        _spawn(4, 99, 700.0, 700.0, map_id=36),  # an instance
        _spawn(5, 99, 900.0, 900.0),  # event-only
        _spawn(6, 99, -50.0, 0.0),  # on no zone
        _spawn(7, 7, 100.0, 100.0),  # not a rare
    ]
    events = event_only_guids([{"guid": 5, "event": 12}, {"guid": 3, "event": -1}])
    assert events == {5}
    spots = rare_spawns(rows, {99}, events, _placer)
    assert spots == {99: [[1429, "Somewhere", 10.0, 10.0], [1429, "Somewhere", 50.0, 50.0]]}


def test_classic_rares_keep_level_spots_and_notable_forever_drops() -> None:
    rares = [_creature(99, "Morgaine the Sly", CLASSIFICATION_RARE), _creature(210107, "Kackle", CLASSIFICATION_RARE)]
    templates = {99: {"Entry": 99, "MinLevel": 10, "MaxLevel": 11, "LootId": 99}}
    loot = {99: [
        {"item": 6201, "ChanceOrQuestChance": 80, "groupid": 0, "mincountOrRef": 1, "maxcount": 1},
        {"item": 1917, "ChanceOrQuestChance": 20, "groupid": 0, "mincountOrRef": 1, "maxcount": 1},
        {"item": 4444, "ChanceOrQuestChance": 50, "groupid": 0, "mincountOrRef": 1, "maxcount": 1},  # not in Forever
        {"item": 5555, "ChanceOrQuestChance": 1, "groupid": 0, "mincountOrRef": 1, "maxcount": 1},  # too rare to name
    ]}
    out = classic_rares(rares, templates, {99: [[1429, "Forest's Edge", 30.8, 64.7]]}, loot, {}, set(), {6201, 1917, 5555})
    assert set(out) == {99}  # Kackle is new in Forever: no Classic data
    assert out[99].as_json() == {
        "minLevel": 10,
        "maxLevel": 11,
        "spawns": [[1429, "Forest's Edge", 30.8, 64.7]],
        "drops": [[6201, 80.0], [1917, 20.0]],
    }
    assert zone_names(out, {1429: "Elwynn Forest", 1433: "Redridge Mountains"}) == {"1429": "Elwynn Forest"}


def test_notable_drops_cut_shared_random_greens() -> None:
    assert notable_drops({1: 0.7, 2: NOTABLE_DROP_CHANCE, 3: 25.0}) == [[3, 25.0], [2, NOTABLE_DROP_CHANCE]]


# --- the committed output ---------------------------------------------------


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_output_is_consistent() -> None:
    forever = _load(RARES_PATH)
    classic = _load(SPAWNS_PATH)
    assert forever["columns"] == ["id", "name", "classification"]
    rares = {int(r[0]): r for r in forever["rares"]}
    assert rares, "no rares — was the build run against an empty creature cache?"
    assert all(r[2] in (CLASSIFICATION_RARE, CLASSIFICATION_RARE_ELITE) for r in rares.values())
    assert set(map(int, classic["rares"])) <= set(rares)
    for rare in classic["rares"].values():
        assert rare["minLevel"] <= rare["maxLevel"]
        for zone, _subzone, x, y in rare["spawns"]:
            assert str(zone) in forever["zones"]
            assert 0 <= x <= 100 and 0 <= y <= 100
        for item, chance in rare["drops"]:
            assert str(item) in forever["items"]
            assert chance >= NOTABLE_DROP_CHANCE
    assert (SPAWNS_PATH.parent / "LICENSE").is_file()
    assert (SPAWNS_PATH.parent / "README.md").is_file()


def test_committed_output_pins_a_known_rare() -> None:
    """Morgaine the Sly: a Forever rare, level 10, in Elwynn Forest, dropping Lithe Boots."""
    forever = _load(RARES_PATH)
    assert [99, "Morgaine the Sly", CLASSIFICATION_RARE] in forever["rares"]
    morgaine = _load(SPAWNS_PATH)["rares"]["99"]
    assert morgaine["minLevel"] == 10
    assert forever["zones"][str(morgaine["spawns"][0][0])] == "Elwynn Forest"
    assert morgaine["drops"][0][0] == 6201
