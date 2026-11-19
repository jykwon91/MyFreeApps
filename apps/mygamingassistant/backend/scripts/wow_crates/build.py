"""Build the Waylaid crates page's data (``/wow-forever/crates``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_crates.build

- The crates are every "Waylaid Crate: X" item in ``data/wow/item_names.json``.
- Each crate's bundles come from its "Use: Fill the crate with any bundle…" text
  in Blizzard's Game Data API (``static-forever-us``; needs
  ``BLIZZARD_CLIENT_ID`` / ``BLIZZARD_CLIENT_SECRET`` in ``backend/.env``).
- The tier is the tier word in the crate's name.
- Each material is matched by exact item name; a name shared by several ids is
  narrowed to the one Forever's item API knows.

Writes ``data/professions/crates/crates.json``. Never hand-edit the output.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.wow_crates.crates import crate_bundles, crate_items, crate_tier, material_id, material_index
from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_item_names.build import OUT_PATH as ITEM_NAMES_FILE
from scripts.wow_talents.blizzard_api import BlizzardStatic, blizzard_credentials, namespace_build

CRATES_FILE = WOW_DATA_DIR / "professions" / "crates" / "crates.json"
ATTRIBUTION = "Crates and their bundles from Blizzard's Game Data API (static-forever-us). Game data © Blizzard Entertainment."


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _line(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def crates_json(build: str, crates: list[dict[str, Any]]) -> str:
    """One crate per line, so a refresh diff names what changed."""
    rows = ",\n".join(_line(c) for c in crates)
    return f'{{"build":{_line(build)},"attribution":{_line(ATTRIBUTION)},\n"crates":[\n{rows}\n]}}\n'


def main() -> None:
    names = _load(ITEM_NAMES_FILE)["names"]
    index = material_index(names)
    crates: list[dict[str, Any]] = []
    build = ""
    with BlizzardStatic(*blizzard_credentials()) as api:
        for crate_id, name in crate_items(names):
            item = api.get(f"/data/wow/item/{crate_id}")
            build = build or namespace_build(item["_links"]["self"]["href"])
            bundles = [
                {"count": count, "item": {"id": material_id(material, index, api.item_known), "name": material}}
                for count, material in crate_bundles(crate_id, item)
            ]
            crates.append({"id": crate_id, "name": name, "tier": crate_tier(name), "bundles": bundles})
    CRATES_FILE.parent.mkdir(parents=True, exist_ok=True)
    CRATES_FILE.write_text(crates_json(build, crates), encoding="utf-8")
    print(f"wrote {len(crates)} crates (build {build}) to {CRATES_FILE}")


if __name__ == "__main__":
    main()
