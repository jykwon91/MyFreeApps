"""Build the Crafting writs page's data (``/wow-forever/writs``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_writs.build [--saved-variables <MGADungeonQuests.lua> ...]

- The writs are every "Craftsman's Writ: X" item in ``data/wow/item_names.json``.
- Each one's tier (Journeyman / Expert / Artisan) and the quest it starts come
  from Blizzard's Game Data API (``static-forever-us``; needs
  ``BLIZZARD_CLIENT_ID`` / ``BLIZZARD_CLIENT_SECRET`` in ``backend/.env``).
- The item each one asks for is matched by craft name in the crafting data.
- Where each is handed in isn't in any game data. MGA Dungeon Quests records
  it in game (``writSpots`` in its SavedVariables). The build adds every
  ``WTF/Account/*/SavedVariables/MGADungeonQuests.lua`` it finds (or the files
  given) to the spots already in the output, so a run never loses one.

Writes ``data/professions/writs/writs.json``. Never hand-edit the output.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_item_names.build import OUT_PATH as ITEM_NAMES_FILE
from scripts.wow_talents.blizzard_api import BlizzardStatic, blizzard_credentials, namespace_build
from scripts.wow_writs.saved_variables import read_saved_variables
from scripts.wow_writs.writs import (
    WRIT_PREFIX,
    merge_turn_ins,
    product_for,
    product_index,
    recorded_turn_ins,
    writ_items,
    writ_quest,
    writ_tier,
)

WRITS_FILE = WOW_DATA_DIR / "professions" / "writs" / "writs.json"
CRAFTING_DIR = WOW_DATA_DIR / "professions" / "crafting"
WTF_ENV = "MGA_WOW_WTF_DIR"
DEFAULT_WTF = Path("D:/World of Warcraft/_forever_/WTF")
ATTRIBUTION = (
    "Writs, tiers and quests from Blizzard's Game Data API (static-forever-us). "
    "Turn-in spots recorded in game by MGA Dungeon Quests. Game data © Blizzard Entertainment."
)


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _line(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def saved_variables_files(given: list[str]) -> list[Path]:
    if given:
        return [Path(p) for p in given]
    wtf = Path(os.environ.get(WTF_ENV) or DEFAULT_WTF)
    return sorted(wtf.glob("Account/*/SavedVariables/MGADungeonQuests.lua"))


def existing_turn_ins(path: Path) -> dict[int, list[dict[str, Any]]]:
    if not path.is_file():
        return {}
    return {int(q): spots for q, spots in _load(path).get("turnIns", {}).items()}


def writs_json(build: str, writs: list[dict[str, Any]], turn_ins: dict[int, list[dict[str, Any]]]) -> str:
    """One writ, and one quest's spots, per line, so a refresh diff names what changed."""
    rows = ",\n".join(_line(w) for w in writs)
    spots = ",\n".join(f"{_line(str(q))}:{_line(s)}" for q, s in turn_ins.items())
    return f'{{"build":{_line(build)},"attribution":{_line(ATTRIBUTION)},\n"writs":[\n{rows}\n],\n"turnIns":{{\n{spots}\n}}}}\n'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--saved-variables", action="append", default=[], help="an MGADungeonQuests.lua to read (repeatable)")
    args = parser.parse_args()

    items = writ_items(_load(ITEM_NAMES_FILE)["names"])
    products = product_index(_load(p) for p in sorted(CRAFTING_DIR.glob("*.json")))
    writs: list[dict[str, Any]] = []
    build = ""
    with BlizzardStatic(*blizzard_credentials()) as api:
        for item_id, name in items:
            item = api.get(f"/data/wow/item/{item_id}")
            build = build or namespace_build(item["_links"]["self"]["href"])
            product_name = name[len(WRIT_PREFIX):]
            writs.append({
                "id": item_id,
                "name": name,
                "tier": writ_tier(item),
                "questId": writ_quest(item),
                "productName": product_name,
                "product": product_for(product_name, products),
            })

    files = saved_variables_files(args.saved_variables)
    recorded = [recorded_turn_ins(read_saved_variables(p.read_text(encoding="utf-8"))) for p in files]
    turn_ins = merge_turn_ins(existing_turn_ins(WRITS_FILE), *recorded)
    WRITS_FILE.parent.mkdir(parents=True, exist_ok=True)
    WRITS_FILE.write_text(writs_json(build, writs, turn_ins), encoding="utf-8")
    unmatched = [w["productName"] for w in writs if w["product"] is None]
    print(f"wrote {len(writs)} writs (build {build}) to {WRITS_FILE}")
    print(f"{len(turn_ins)} writs have a turn-in spot (read {len(files)} SavedVariables file(s))")
    if unmatched:
        print(f"no single crafted item matches {len(unmatched)}: {', '.join(unmatched)}")


if __name__ == "__main__":
    main()
