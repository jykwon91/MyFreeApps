"""Waylaid Crates: which crates there are, their tier, and the bundles that fill each one."""
from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any

CRATE_PREFIX = "Waylaid Crate: "
TIERS = ("apprentice", "journeyman", "expert", "artisan")
# A crate's item quality sets its reward with its tier (the page holds the reward table).
QUALITIES = ("common", "uncommon")
FILL_INTRO = "Fill the crate with any bundle from the following list:"
_BUNDLE = re.compile(r"^- (?P<count>\d+) (?P<name>.+)$")


def crate_items(item_names: Mapping[str, str]) -> list[tuple[int, str]]:
    """Every "Waylaid Crate: X" item the client knows, by id (the unlabelled "Waylaid Crate" is opened, not filled)."""
    return sorted((int(i), n) for i, n in item_names.items() if n.startswith(CRATE_PREFIX))


def crate_tier(name: str) -> str:
    """Apprentice / Journeyman / Expert / Artisan, from the crate's name ("Earthly Expert Herbs" is Expert)."""
    words = name[len(CRATE_PREFIX):].lower().split()
    found = [t for t in TIERS if t in words]
    if len(found) != 1:
        raise SystemExit(f"crate {name!r}: expected one tier word ({', '.join(TIERS)}), found {found}")
    return found[0]


def crate_quality(crate_id: int, item: Mapping[str, Any]) -> str:
    """The crate's item quality, lower-case ("common" or "uncommon"); anything else stops the build."""
    quality = str(((item.get("quality") or {}).get("type")) or "").lower()
    if quality not in QUALITIES:
        raise SystemExit(f"crate {crate_id}: expected quality {' or '.join(QUALITIES)}, found {quality or 'none'!r}")
    return quality


def crate_bundles(crate_id: int, item: Mapping[str, Any]) -> list[tuple[int, str]]:
    """(count, material name) for each bundle in the crate's "Use: Fill the crate…" text, in the game's order."""
    spells = ((item.get("preview_item") or {}).get("spells")) or []
    texts = [s.get("description") or "" for s in spells if FILL_INTRO in (s.get("description") or "")]
    if len(texts) != 1:
        raise SystemExit(f"crate {crate_id}: expected one 'Fill the crate' spell, found {len(texts)}")
    lines = [line.strip() for line in texts[0].split(FILL_INTRO, 1)[1].splitlines() if line.strip()]
    bundles = []
    for line in lines:
        match = _BUNDLE.match(line)
        if not match:
            raise SystemExit(f"crate {crate_id}: can't read bundle line {line!r}")
        bundles.append((int(match.group("count")), match.group("name")))
    if not bundles:
        raise SystemExit(f"crate {crate_id}: no bundles listed")
    return bundles


def material_index(item_names: Mapping[str, str]) -> dict[str, list[int]]:
    """Item name → every id with that name."""
    index: dict[str, list[int]] = {}
    for item_id, name in item_names.items():
        index.setdefault(name, []).append(int(item_id))
    return index


def material_id(name: str, index: Mapping[str, list[int]], known: Callable[[int], bool]) -> int:
    """The one item a bundle names. Same-named ids are narrowed to those Forever's item API knows; still not one = stop."""
    ids = sorted(index.get(name, []))
    if len(ids) > 1:
        ids = [i for i in ids if known(i)]
    if len(ids) != 1:
        raise SystemExit(f"material {name!r}: expected one item, found {ids}")
    return ids[0]
