"""Forever client item names: the generator's filter and the committed file."""
from __future__ import annotations

from app.services.wow.prices.client_item_names import ClientItemNames, client_item_names
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


def test_source_name_wins_and_client_name_fills_blanks() -> None:
    names = ClientItemNames(client_build="1.60.1.70790", names={249391: "Pyrite"})
    assert names.name_for(2589, "Linen Cloth") == "Linen Cloth"
    assert names.name_for(249391, "") == "Pyrite"
    assert names.name_for(999999, "") == ""


def test_committed_file_names_forever_items_tsm_leaves_blank() -> None:
    # Pinned against the Forever client: a failure means the client changed.
    names = client_item_names()
    assert names.client_build
    assert names.names[247789] == "Novice's Practice Wand"
    assert names.names[249391] == "Pyrite"
