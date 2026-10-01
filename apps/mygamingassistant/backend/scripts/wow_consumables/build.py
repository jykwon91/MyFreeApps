"""Build the WoW Forever raid consumables dataset.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_consumables.build

Writes ``backend/data/wow/raid_consumables.json`` — the committed dataset
consumed at runtime by ``app/services/wow/raid_consumables.py``.

Item display names are resolved from the WoW Forever beta client's
``ItemSparse`` table (build 1.60.1.69977) via wago.tools.  The build FAILS
loudly if any item id listed in the spec is absent from the client — that
indicates either a typo in the spec or a genuine Forever item-id divergence
that must be handled explicitly.

Game data © Blizzard Entertainment, accessed via wago.tools DB2 export.
"""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from scripts.wow_consumables.spec import (
    ALWAYS,
    BLOCKED_IDS,
    CLASS_EXTRAS,
    FOOD,
    RAID_SPECIFIC,
    RAIDS,
    ROLE_BASELINE,
)
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_PATH = BACKEND_DIR / "data" / "wow" / "raid_consumables.json"

WOWHEAD_BASE = "https://www.wowhead.com/classic/item="

ATTRIBUTION = (
    "Item names sourced from WoW Forever beta client "
    f"(build {WAGO_BUILD}) via wago.tools DB2 export. "
    "Game data © Blizzard Entertainment."
)


def _wowhead(item_id: int) -> str:
    return f"{WOWHEAD_BASE}{item_id}"


def _load_names() -> dict[int, str]:
    """Return {item_id: display_name} from the Forever client ItemSparse."""
    print(f"Loading ItemSparse from wago.tools ({WAGO_BRANCH} {WAGO_BUILD})...")
    rows = wago_table("ItemSparse")
    names: dict[int, str] = {}
    for row in rows:
        try:
            item_id = int(row["ID"])
        except (ValueError, KeyError):
            continue
        name = row.get("Display_lang", "").strip()
        if name:
            names[item_id] = name
    print(f"  {len(names):,} named items loaded")
    return names


def _resolve(section_name: str, items: list[dict], names: dict[int, str]) -> list[dict]:
    """Resolve names and Wowhead URLs for a list of spec items.

    Raises ``SystemExit`` if any item id is missing from the Forever client or
    is present in the blocked list.
    """
    resolved = []
    for item in items:
        item_id = item.get("item_id")
        if item_id is None:
            # Non-addressable item (e.g. "Repair to 100%") — excluded from JSON.
            continue
        if item_id in BLOCKED_IDS:
            print(f"  BLOCKED {item_id} in {section_name} — excluded per spec")
            continue
        if item_id not in names:
            print(f"ERROR: item {item_id} in {section_name!r} missing from Forever ItemSparse "
                  f"(build {WAGO_BUILD}). Fix the spec or handle the id divergence.", file=sys.stderr)
            sys.exit(1)
        entry: dict = {
            "item_id": item_id,
            "name": names[item_id],
            "why": item["why"],
            "tier": item["tier"],
            "wowhead_url": _wowhead(item_id),
        }
        if "roles" in item:
            entry["roles"] = item["roles"]
        if "classes" in item:
            entry["classes"] = item["classes"]
        resolved.append(entry)
    return resolved


def main() -> None:
    names = _load_names()

    # Verify BLOCKED_IDS are actually present in the client (double-check provenance).
    for blocked_id in sorted(BLOCKED_IDS):
        if blocked_id in names:
            print(f"  BLOCKED {blocked_id} ({names[blocked_id]!r}) — present in client but excluded by spec")
        else:
            print(f"  BLOCKED {blocked_id} — not in client either (spec may be stale)")

    # --- Raid-specific ---
    raid_specific: dict[str, list[dict]] = {}
    for raid_key, items in RAID_SPECIFIC.items():
        raid_specific[raid_key] = _resolve(f"raid_specific.{raid_key}", items, names)

    # --- Role baselines ---
    role_baseline: dict[str, list[dict]] = {}
    for role, items in ROLE_BASELINE.items():
        role_baseline[role] = _resolve(f"role_baseline.{role}", items, names)

    # --- Class extras ---
    class_extras: dict[str, list[dict]] = {}
    for cls, items in CLASS_EXTRAS.items():
        class_extras[cls] = _resolve(f"class_extras.{cls}", items, names)

    # --- Food ---
    food: dict[str, list[dict]] = {}
    for key, items in FOOD.items():
        food[key] = _resolve(f"food.{key}", items, names)

    # --- Always ---
    always = _resolve("always", ALWAYS, names)

    # --- Build payload ---
    payload = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "client_build": WAGO_BUILD,
        "attribution": ATTRIBUTION,
        "raids": RAIDS,
        "raid_specific": raid_specific,
        "role_baseline": role_baseline,
        "class_extras": class_extras,
        "food": food,
        "always": always,
    }

    # --- Write ---
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")

    total_items = (
        sum(len(v) for v in raid_specific.values())
        + sum(len(v) for v in role_baseline.values())
        + sum(len(v) for v in class_extras.values())
        + sum(len(v) for v in food.values())
        + len(always)
    )
    print(f"Wrote {total_items} resolved item entries -> {OUT_PATH}")


if __name__ == "__main__":
    main()
