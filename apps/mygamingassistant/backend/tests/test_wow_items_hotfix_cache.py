"""WoW Forever item rows from hotfixes: the client cache reader, the layout
decoder and the merge rules. Every fixture is a few synthetic bytes, never the
real game cache."""
from __future__ import annotations

import struct
from pathlib import Path

import pytest

from scripts.wow_items import forever_items
from scripts.wow_items.dbd import DbdError, decode_record, layout_for, parse_dbd
from scripts.wow_items.forever_items import HOTFIX_CACHE_ENV, cache_overlay, hotfix_cache_path, merge_rows
from scripts.wow_items.hotfix_cache import (
    STATUS_RECORD_REMOVED,
    STATUS_VALID,
    HotfixCache,
    HotfixCacheError,
    HotfixEntry,
    latest_records,
    parse_hotfix_cache,
)

TABLE = 0x919BE54E
OTHER_TABLE = 0x50238EC2
STATUS_INVALID = 3

DBD = """COLUMNS
int ID
locstring Display_lang
float DmgVariance
int Flags
int ItemLevel
int AllowableClass
int OverallQualityID

LAYOUT AAAA0001
BUILD 1.60.1.70790, 1.60.1.70862
COMMENT table is sparse
$noninline,id$ID<32>
Display_lang
DmgVariance
Flags<u32>[2]
ItemLevel<u16>
AllowableClass<16>
OverallQualityID<8>

LAYOUT BBBB0002
BUILD 1.60.1.70900
$noninline,id$ID<32>
Display_lang
ItemLevel<u16>
"""


def _record(name: str = "Hand of Justice", level: int = 58) -> bytes:
    return name.encode() + b"\0" + struct.pack("<fIIHhb", 0.6, 0x80000, 4, level, -1, 3)


def _entry(record_id: int, data: bytes = b"", *, push: int = 1, status: int = STATUS_VALID, table: int = TABLE) -> bytes:
    return struct.pack("<4siiIIIIB3x", b"XFTH", 91, push, 0, table, record_id, len(data), status) + data


def _cache(*entries: bytes, version: int = 9, build: int = 70862) -> bytes:
    return struct.pack("<4sII32s", b"XFTH", version, build, b"\0" * 32) + b"".join(entries)


# --- the cache file ---------------------------------------------------------


def test_parses_header_and_entries() -> None:
    cache = parse_hotfix_cache(_cache(_entry(11815, _record(), push=0x1000000 + 11815), _entry(1664, status=STATUS_INVALID)))
    assert (cache.version, cache.build) == (9, 70862)
    assert [(e.record_id, e.status, e.region_id) for e in cache.entries] == [(11815, 1, 91), (1664, 3, 91)]
    assert cache.entries[0].data == _record()
    assert cache.entries[1].data == b""


@pytest.mark.parametrize(("blob", "message"), [
    (b"XFTH", "shorter than"),
    (_cache().replace(b"XFTH", b"WDC5", 1), "not a hotfix cache"),
    (_cache(version=8), "version 8"),
    (_cache(_entry(1, _record()))[:-3], "truncated entry data"),
    (_cache(_entry(1, _record())) + b"XFTH", "truncated entry header"),
    (_cache(_entry(1, _record()).replace(b"XFTH", b"JUNK", 1)), "bad entry magic"),
])
def test_rejects_files_it_cannot_read(blob: bytes, message: str) -> None:
    with pytest.raises(HotfixCacheError, match=message):
        parse_hotfix_cache(blob)


def _e(record_id: int, push: int, status: int = STATUS_VALID, data: bytes = b"x", table: int = TABLE) -> HotfixEntry:
    return HotfixEntry(91, push, 0, table, record_id, status, data)


def test_latest_records_takes_the_newest_push_and_skips_entries_without_an_answer() -> None:
    records = latest_records([
        _e(1, 10, data=b"old"),
        _e(1, 0x1000001, data=b"on demand"),  # an on-demand reply is the server's current answer
        _e(1, 20, data=b"older push, read later"),
        _e(2, 10, data=b"kept"),
        _e(2, 30, STATUS_INVALID, b""),  # "nothing to send" doesn't erase what we have
        _e(3, 10, data=b"gone soon"),
        _e(3, 11, STATUS_RECORD_REMOVED, b""),
        _e(4, 10, data=b"another table", table=OTHER_TABLE),
        _e(5, 10, 4, b""),  # not public
    ], TABLE)
    assert records == {1: b"on demand", 2: b"kept", 3: None}


# --- the layout decoder -----------------------------------------------------


def test_decodes_a_record_like_the_wago_csv() -> None:
    layout = layout_for(parse_dbd(DBD), "1.60.1.70790")
    assert decode_record(layout, 11815, _record()) == {
        "ID": "11815",
        "Display_lang": "Hand of Justice",
        "DmgVariance": "0.60000002384186",
        "Flags_0": "524288",
        "Flags_1": "4",
        "ItemLevel": "58",
        "AllowableClass": "-1",
        "OverallQualityID": "3",
    }


def test_layouts_are_found_by_full_version_or_bare_build_number() -> None:
    layouts = parse_dbd(DBD)
    assert layout_for(layouts, "70862") is layout_for(layouts, "1.60.1.70790")
    assert layout_for(layouts, "1.60.1.70900").hashes == ("BBBB0002",)
    with pytest.raises(DbdError, match="no layout covers"):
        layout_for(layouts, "1.60.1.69000")


def test_build_ranges_are_covered() -> None:
    text = DBD.replace("BUILD 1.60.1.70900", "BUILD 1.60.1.70900-1.60.1.71000")
    assert layout_for(parse_dbd(text), "1.60.1.70950").hashes == ("BBBB0002",)


@pytest.mark.parametrize("data", [_record() + b"\0", _record()[:-1], b"no terminator"])
def test_a_record_that_does_not_fit_the_layout_fails(data: bytes) -> None:
    layout = layout_for(parse_dbd(DBD), "1.60.1.70790")
    with pytest.raises(DbdError):
        decode_record(layout, 1, data)


def test_unsupported_definitions_fail() -> None:
    with pytest.raises(DbdError, match="non-inline"):
        parse_dbd(DBD.replace("Display_lang\nDmgVariance", "$noninline,relation$Display_lang\nDmgVariance", 1))
    with pytest.raises(DbdError, match="no column type"):
        parse_dbd(DBD.replace("ItemLevel<u16>\nAllowableClass", "Mystery<u16>\nAllowableClass", 1))


# --- merge rules ------------------------------------------------------------


def test_overlay_replaces_adds_and_removes_rows() -> None:
    base = [{"ID": "2", "Display_lang": "file"}, {"ID": "1", "Display_lang": "file"}, {"ID": "3", "Display_lang": "file"}]
    merged = merge_rows(base, {1: {"ID": "1", "Display_lang": "hotfix"}, 3: None, 4: {"ID": "4", "Display_lang": "new"}, 9: None})
    assert merged == {
        1: {"ID": "1", "Display_lang": "hotfix"},
        2: {"ID": "2", "Display_lang": "file"},
        4: {"ID": "4", "Display_lang": "new"},
    }


def test_cache_overlay_decodes_records_with_the_pinned_layout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(forever_items, "WAGO_BUILD", "1.60.1.70790")
    cache = HotfixCache(9, 70862, (_e(11815, 5, data=_record()), _e(7, 5, STATUS_RECORD_REMOVED, b"")))
    overlay = cache_overlay(cache, "ItemSparse", DBD)
    assert overlay[7] is None
    assert overlay[11815] is not None and overlay[11815]["Display_lang"] == "Hand of Justice"


def test_a_cache_from_a_build_with_another_layout_stops_the_run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(forever_items, "WAGO_BUILD", "1.60.1.70790")
    with pytest.raises(SystemExit, match="layout differs"):
        cache_overlay(HotfixCache(9, 70900, ()), "ItemSparse", DBD)


# --- where the cache is -----------------------------------------------------


def test_cache_path_prefers_the_argument_then_the_env_var(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arg, env = tmp_path / "arg.bin", tmp_path / "env.bin"
    arg.write_bytes(b"")
    env.write_bytes(b"")
    monkeypatch.setenv(HOTFIX_CACHE_ENV, str(env))
    assert hotfix_cache_path(str(arg)) == arg
    assert hotfix_cache_path(None) == env


def test_a_missing_cache_fails_loudly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(HOTFIX_CACHE_ENV, raising=False)
    monkeypatch.setattr(forever_items, "DEFAULT_HOTFIX_CACHE", tmp_path / "nope.bin")
    with pytest.raises(SystemExit, match="hotfix cache not found"):
        hotfix_cache_path(None)
    with pytest.raises(SystemExit, match="hotfix cache not found"):
        hotfix_cache_path(str(tmp_path / "missing.bin"))
