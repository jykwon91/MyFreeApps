"""The Forever client's ``Item`` and ``ItemSparse`` rows, hotfixes included.

The Forever client file holds only about 19,300 ItemSparse rows against
32,000 Item rows: most Classic gear (Hand of Justice, Blackhand's Breadth …)
isn't in it at all. It isn't encrypted away either — only ~90 rows sit in
TACT-keyed sections. The server sends those items as hotfix records, and the
client asks for each one the first time it meets the item.

So the rows are built in three layers, each newer than the one under it:

1. the client file, as wago.tools exports it;
2. the hotfix records wago.tools has collected (``useHotfixes=1``) — what the
   game itself puts over the file;
3. the operator's own Forever client cache (``DBCache.bin``), whose records
   are the server's latest answer to that client. It wins over wago.tools,
   which doesn't say how old its hotfixes are. A record the server removed is
   dropped.

Items no client has asked the server about yet are in none of these; they
stay out rather than being filled from another client's (re-itemized) data.
"""
from __future__ import annotations

import os
import shutil
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

from scripts.wow_items.dbd import decode_record, layout_for, parse_dbd
from scripts.wow_items.hotfix_cache import HotfixCache, latest_records, parse_hotfix_cache
from scripts.wow_world_map.sources import CACHE_DIR, WAGO_BRANCH, WAGO_BUILD, wago_table, wowdbdefs_definition

Row = dict[str, str]

HOTFIX_CACHE_ENV = "WOW_FOREVER_HOTFIX_CACHE"
DEFAULT_HOTFIX_CACHE = Path(r"D:\World of Warcraft\_forever_\Cache\ADB\enUS\DBCache.bin")
# Table hash in each table's DB2 header (Item/ItemSparse checked on 1.60.1.70862; the spell
# tables are WoWDBDefs' manifest.json hashes, matched against the 70862 cache's entries).
TABLE_HASHES = {
    "Item": 0x50238EC2,
    "ItemSparse": 0x919BE54E,
    "Spell": 0xE111669E,
    "SpellName": 0x46C66698,
    "SpellEffect": 0xF04238A5,
    "SpellMisc": 0xC603EE28,
    "SpellAuraOptions": 0xF42FC065,
    "SpellDuration": 0xB423FA7A,
    "SpellRadius": 0xAB7E4841,
    "Talent": 0xF9A4265F,
    "TalentTab": 0x425D88C8,
}
ITEM_TABLES = ("Item", "ItemSparse")


@dataclass(frozen=True)
class ForeverItemTables:
    item: dict[int, Row]
    sparse: list[Row]
    source: str


@dataclass(frozen=True)
class ForeverTables:
    """Client tables by name, each row by id with the hotfix layers applied."""

    rows: dict[str, dict[int, Row]]
    cache_build: int
    from_cache: int

    def table(self, name: str) -> list[Row]:
        return list(self.rows[name].values())

    def source(self) -> str:
        return (
            f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} with hotfixes, plus the Forever client hotfix cache "
            f"(build {self.cache_build}, {self.from_cache:,} records)"
        )


def hotfix_cache_path(cli_value: str | None) -> Path:
    """The client cache to read: ``--hotfix-cache``, else the env var, else the operator's install."""
    path = Path(cli_value or os.environ.get(HOTFIX_CACHE_ENV) or DEFAULT_HOTFIX_CACHE)
    if not path.is_file():
        raise SystemExit(
            f"WoW Forever hotfix cache not found at {path}.\n"
            "Most Forever items exist only as server hotfixes, and this file is where the game keeps them,\n"
            "so the item list would come out short without it. Point at the client's\n"
            "_forever_/Cache/ADB/enUS/DBCache.bin with --hotfix-cache <path> or "
            f"{HOTFIX_CACHE_ENV}=<path>."
        )
    return path


def read_hotfix_cache(path: Path) -> HotfixCache:
    """Parse a copy of the cache, so the game's own file is only ever read."""
    copy = CACHE_DIR / "client-hotfixes" / "DBCache.bin"
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, copy)
    return parse_hotfix_cache(copy.read_bytes())


def merge_rows(base: Iterable[Row], overlay: Mapping[int, Row | None]) -> dict[int, Row]:
    """Rows by id with the overlay on top: a row replaces, None removes."""
    rows = {int(row["ID"]): row for row in base}
    for record_id, row in overlay.items():
        if row is None:
            rows.pop(record_id, None)
        else:
            rows[record_id] = row
    return dict(sorted(rows.items()))


def cache_overlay(cache: HotfixCache, table: str, definition: str) -> dict[int, Row | None]:
    """A table's records from the client cache, decoded with the layout the pinned build uses.

    The cache comes from whatever build the client is on. Its records only
    line up with the wago.tools columns when that build has the pinned
    build's layout, so anything else stops the run.
    """
    layouts = parse_dbd(definition)
    pinned = layout_for(layouts, WAGO_BUILD)
    client = layout_for(layouts, str(cache.build))
    if client is not pinned:
        raise SystemExit(
            f"{table}: the client cache is from build {cache.build}, whose layout differs from the pinned "
            f"{WAGO_BUILD}. Repin with `python -m scripts.wow_refresh apply`, or log into the game on the pinned build."
        )
    return {
        record_id: None if data is None else decode_record(pinned, record_id, data)
        for record_id, data in latest_records(cache.entries, TABLE_HASHES[table]).items()
    }


def load_forever_tables(cache_path: Path, tables: Iterable[str]) -> ForeverTables:
    """``tables`` in three layers: the client file, wago.tools' hotfixes, then the client cache."""
    cache = read_hotfix_cache(cache_path)
    merged: dict[str, dict[int, Row]] = {}
    from_cache = 0
    for table in tables:
        overlay = cache_overlay(cache, table, wowdbdefs_definition(table, cache.build))
        merged[table] = merge_rows(wago_table(table, hotfixes=True), overlay)
        from_cache += len(overlay)
    return ForeverTables(merged, cache.build, from_cache)


def load_forever_item_tables(cache_path: Path) -> ForeverItemTables:
    forever = load_forever_tables(cache_path, ITEM_TABLES)
    plain = len(wago_table("ItemSparse"))
    source = forever.source()
    print(
        f"ItemSparse: {plain:,} rows in the client file, {len(forever.rows['ItemSparse']):,} with hotfixes "
        f"({forever.from_cache:,} Item/ItemSparse records from the client cache, build {forever.cache_build})"
    )
    return ForeverItemTables(forever.rows["Item"], forever.table("ItemSparse"), source)
