"""Forever client item names: the generator's filter and the committed file."""
from __future__ import annotations

import json

from app.services.wow.prices.client_item_names import ClientItemNames, client_item_names, parse_client_item_names
from scripts.wow_item_names.build import tradeable_names


def _row(item_id: str, name: str, bonding: str = "0") -> dict[str, str]:
    return {"ID": item_id, "Display_lang": name, "Bonding": bonding}


def test_tradeable_names_keeps_only_named_items_the_auction_house_can_list() -> None:
    rows = [
        _row("249391", "Pyrite"),
        _row("2589", "Linen Cloth"),
        _row("19019", "Thunderfury", bonding="1"),  # binds on pickup
        _row("5179", "Moss-covered Gauntlets", bonding="4"),  # quest item
        _row("100", "  "),
        _row("abc", "Bad id"),
        _row("12345", "Bind on equip", bonding="2"),
    ]
    assert tradeable_names(rows) == {2589: "Linen Cloth", 12345: "Bind on equip", 249391: "Pyrite"}


def test_name_for_reads_the_client_name_else_empty() -> None:
    names = ClientItemNames(version="v1", names={249391: "Pyrite"})
    assert names.name_for(249391) == "Pyrite"
    assert names.name_for(999999) == ""


def test_committed_file_names_forever_only_items() -> None:
    # Pinned against the Forever client: a failure means the client changed.
    names = client_item_names()
    assert names.version
    assert names.names[247789] == "Novice's Practice Wand"
    assert names.names[249391] == "Pyrite"


def test_committed_file_names_items_only_the_hotfix_cache_has() -> None:
    # These come from the client's hotfix cache, not its ItemSparse file; the AH sells them.
    names = client_item_names().names
    assert names[16702] == "Dreadmist Belt"
    assert names[1980] == "Underworld Band"
    assert names[1713] == "Ankh of Life"


def test_version_changes_with_the_file_so_cached_prices_get_new_names() -> None:
    def raw(names: dict[str, str]) -> bytes:
        return json.dumps({"clientBuild": "1.60.1.70888", "names": names}).encode("utf-8")

    before = parse_client_item_names(raw({"2589": "Linen Cloth"}))
    after = parse_client_item_names(raw({"2589": "Linen Cloth", "16702": "Dreadmist Belt"}))
    assert before.version != after.version
    assert parse_client_item_names(raw({"2589": "Linen Cloth"})).version == before.version
    assert after.name_for(16702) == "Dreadmist Belt"
