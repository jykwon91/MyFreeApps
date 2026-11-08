"""Build the WoW Forever class details: icon file data IDs and resource types.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_classes.build

Reads ``ChrClasses`` from the Forever client (wago.tools ``wowf`` pinned build)
and writes ``data/classes/classDetails.json``::

    {"source": ..., "clientBuild": "1.60.1.70790",
     "classes": {
       "warrior": {"icon": 626008, "resource": "rage"},
       ...
     }}

``icon`` is the ``IconFileDataID`` column — the icon file id the icon pipeline
adds to its ``files`` wanted set. ``resource`` is derived from ``DisplayPower``
(0 = Mana, 1 = Rage, 3 = Energy). Only the nine Forever classes are emitted.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import json
from pathlib import Path

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_world_map.sources import WAGO_BUILD, wago_table

OUT_FILE = WOW_DATA_DIR / "classes" / "classDetails.json"

# Stable mapping from wago.tools ChrClasses.ID → our slug (classes.ts).
# The nine IDs that are playable in WoW Forever.
_CLASS_ID_TO_SLUG: dict[int, str] = {
    1: "warrior",
    2: "paladin",
    3: "hunter",
    4: "rogue",
    5: "priest",
    7: "shaman",
    8: "mage",
    9: "warlock",
    11: "druid",
}

# ChrClasses.DisplayPower values for the nine classes.
_DISPLAY_POWER_TO_RESOURCE: dict[int, str] = {
    0: "mana",
    1: "rage",
    3: "energy",
}


def build_class_details() -> dict[str, dict[str, int | str]]:
    """Read ChrClasses from wago.tools and return {slug: {icon, resource}}."""
    rows = wago_table("ChrClasses", hotfixes=True)
    columns = rows[0]
    id_col = columns.index("ID")
    icon_col = columns.index("IconFileDataID")
    power_col = columns.index("DisplayPower")

    result: dict[str, dict[str, int | str]] = {}
    for row in rows[1:]:
        class_id = int(row[id_col])
        slug = _CLASS_ID_TO_SLUG.get(class_id)
        if slug is None:
            continue
        icon = int(row[icon_col])
        display_power = int(row[power_col])
        resource = _DISPLAY_POWER_TO_RESOURCE.get(display_power, "mana")
        result[slug] = {"icon": icon, "resource": resource}
    return result


def main() -> None:
    print(f"Loading ChrClasses from wago.tools ({WAGO_BUILD})...")
    classes = build_class_details()
    if len(classes) != len(_CLASS_ID_TO_SLUG):
        missing = set(_CLASS_ID_TO_SLUG.values()) - set(classes.keys())
        raise SystemExit(f"Missing classes in ChrClasses: {missing}")
    payload = {
        "source": f"WoW Forever client build {WAGO_BUILD} (wowf) via wago.tools. Game data © Blizzard Entertainment.",
        "clientBuild": WAGO_BUILD,
        "classes": classes,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_FILE.name}: {len(classes)} classes")
    for slug, detail in sorted(classes.items()):
        print(f"  {slug}: icon={detail['icon']} resource={detail['resource']}")


if __name__ == "__main__":
    main()
